from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from src import canonical_artifacts, chronology_discovery
from src.ai_reports import retrieve_evidence
from src.canonical_artifacts import segments_from_pages, write_canonical_artifact
from src.chronology_v2 import PreparedChronologyQuery
from src.evidence_model import EvidenceItem
from src.master_event_store import MasterEventStore


def _prepared(topic: str = "delay", parties=()) -> PreparedChronologyQuery:
    return PreparedChronologyQuery(
        original_query=topic, english_query=topic, jargon_matches=(),
        parties=tuple(parties), contracts=(), work_packages=(), exclusions=(),
        research_queries=(topic,),
    )


def _persist_event(
    store: MasterEventStore, tmp_path: Path, *, project_id: str, doc_id: str,
    actor: str = "Contractor", event_type: str = "delay",
    normalized_date: str = "2024-03", date_precision: str = "month",
):
    text = f"In March 2024, {actor} reported critical access delay."
    artifact = write_canonical_artifact(
        project_id=project_id, doc_id=doc_id, file_name=f"{doc_id}.pdf",
        source_kind="document", segments=segments_from_pages({1: text}),
    )
    store.register_artifact(artifact)
    run_id = store.begin_run(
        project_id=project_id, version_id=artifact.version_id, model="test",
        prompt_hash="prompt", schema_hash="schema", jargon_hash="jargon",
    )
    segment = artifact.segments[0]
    claim_start = text.index(actor)
    claim = text[claim_start:]
    date_text = "March 2024"
    date_start = text.index(date_text)
    observation_id = hashlib.sha256(f"{project_id}|{doc_id}|observation".encode()).hexdigest()[:32]
    cluster_id = hashlib.sha256(f"{project_id}|{doc_id}|cluster".encode()).hexdigest()[:32]
    store.persist_observations(project_id, run_id, artifact.version_id, [{
        "observation_id": observation_id, "segment_id": segment.segment_id,
        "event_type": event_type, "actor": actor,
        "action_text": "reported critical access delay", "object_text": "access delay",
        "party_position": "", "consequence": "", "materiality": "high",
        "confidence": "high", "undated_material": False,
        "claim_start": claim_start, "claim_end": len(text), "claim_quote": claim,
        "claim_sha256": hashlib.sha256(claim.encode()).hexdigest(),
        "source_locator": {"page": 1},
        "search_text": f"{event_type} {actor} critical access delay {normalized_date}",
        "jargon": [],
        "date": {
            "event_date_id": hashlib.sha256(f"{observation_id}|date".encode()).hexdigest()[:32],
            "normalized_date": normalized_date, "date_precision": date_precision,
            "date_role": "occurrence", "evidence_start": date_start,
            "evidence_end": date_start + len(date_text), "evidence_text": date_text,
            "evidence_sha256": hashlib.sha256(date_text.encode()).hexdigest(),
            "is_primary": True,
        },
        "cluster": {
            "cluster_id": cluster_id, "normalized_date": normalized_date,
            "event_type": event_type, "canonical_actor": actor.casefold(),
            "normalized_action_object": "reported critical access delay",
        },
    }])
    store.finish_run(
        project_id=project_id, version_id=artifact.version_id,
        run_id=run_id, status="ready",
    )
    return artifact, observation_id


def test_master_search_needs_no_vector_database_and_enforces_filters(tmp_path, monkeypatch):
    monkeypatch.setattr(canonical_artifacts, "CANONICAL_ROOT", tmp_path / "canonical")
    store = MasterEventStore(duckdb_path=tmp_path / "master-events.db")
    _, expected = _persist_event(store, tmp_path, project_id="p1", doc_id="contractor")
    _persist_event(store, tmp_path, project_id="p1", doc_id="employer", actor="Employer")
    _persist_event(store, tmp_path, project_id="p2", doc_id="other-project")

    rows = store.search_observations(
        project_id="p1", query="critical access delay", parties=["Contractor"],
        event_types=["delay"], date_from="2024-03-15", date_to="2024-03-20",
    )

    assert [row["observation_id"] for row in rows] == [expected]
    assert rows[0]["doc_id"] == "contractor"
    assert rows[0]["normalized_date"] == "2024-03"


def test_chronology_uses_master_fts_when_event_vector_search_is_down(tmp_path, monkeypatch):
    monkeypatch.setattr(canonical_artifacts, "CANONICAL_ROOT", tmp_path / "canonical")
    store = MasterEventStore(duckdb_path=tmp_path / "master-events.db")
    _persist_event(store, tmp_path, project_id="p1", doc_id="delay-letter")
    monkeypatch.setattr(chronology_discovery, "CHRONOLOGY_EVENT_DISCOVERY_MODE", "primary_fallback")
    monkeypatch.setattr("src.master_event_store.get_master_event_store", lambda: store)
    monkeypatch.setattr(
        "src.event_vector_index.get_event_vector_index",
        lambda: SimpleNamespace(search=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("offline"))),
    )
    fallback_calls = []

    result = chronology_discovery.discover_chronology_evidence(
        project_id="p1", prepared=_prepared(),
        fallback=lambda queries, doc_ids: fallback_calls.append((queries, doc_ids)) or [],
    )

    assert not fallback_calls
    assert len(result.evidence) == 1
    assert result.evidence[0].source_id.startswith("evt_")
    assert result.audit["dense_event_index_used"] is False
    assert result.audit["search_degradations"] == ["event_vector_search_unavailable"]


def test_event_store_outage_falls_back_only_to_document_index_scope(monkeypatch):
    monkeypatch.setattr(chronology_discovery, "CHRONOLOGY_EVENT_DISCOVERY_MODE", "primary_fallback")
    monkeypatch.setattr(
        "src.master_event_store.get_master_event_store",
        lambda: (_ for _ in ()).throw(RuntimeError("database unavailable")),
    )
    monkeypatch.setattr(
        "src.document_index.get_document_index",
        lambda: SimpleNamespace(search=lambda **kwargs: [SimpleNamespace(doc_id="related-doc")]),
    )
    scopes = []
    fallback_item = EvidenceItem(
        source_id="legacy", doc_id="related-doc", file_name="related.pdf", excerpt="delay evidence",
    )

    result = chronology_discovery.discover_chronology_evidence(
        project_id="p1", prepared=_prepared(),
        fallback=lambda queries, doc_ids: scopes.append(list(doc_ids)) or [fallback_item],
    )

    assert scopes == [["related-doc"]]
    assert result.evidence == [fallback_item]
    assert result.audit["partial_reasons"] == ["master_event_store_unavailable"]


def test_document_lexical_lane_survives_document_vector_outage(monkeypatch):
    fake_rag = SimpleNamespace(query=lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
    fake_lexical = SimpleNamespace(search_chunks=lambda *args, **kwargs: [{
        "chunk_id": "chunk-1", "doc_id": "doc-1", "file_name": "notice.pdf",
        "page_number": 4, "text": "The Contractor issued a delay notice.", "lex_score": 8.0,
    }])
    empty_connection = SimpleNamespace(execute=lambda *args, **kwargs: SimpleNamespace(fetchall=lambda: []))
    monkeypatch.setattr("src.document_rag.get_document_rag", lambda: fake_rag)
    monkeypatch.setattr("src.lexical_index.get_lexical_index", lambda: fake_lexical)
    monkeypatch.setattr("src.chunk_store.get_chunk_store", lambda: SimpleNamespace(connection=lambda: empty_connection))

    evidence = retrieve_evidence("p1", ["delay notice"], top_k=5)

    assert len(evidence) == 1
    assert evidence[0].doc_id == "doc-1"
    assert evidence[0].excerpt == "The Contractor issued a delay notice."


def test_event_and_document_semantic_indexes_are_separate():
    from src.chunk_store import CHUNKS_DB
    from src.config import QDRANT_COLLECTION, STORAGE_DIR
    from src.event_vector_index import EVENT_COLLECTION, EVENT_NAMESPACE

    assert EVENT_COLLECTION != QDRANT_COLLECTION
    assert EVENT_COLLECTION == f"{QDRANT_COLLECTION}_events"
    assert EVENT_NAMESPACE == "__events__"
    assert EVENT_NAMESPACE not in {"", "__default__"}
    assert CHUNKS_DB != Path(STORAGE_DIR) / "master_events" / "master_events.db"


def test_invalid_event_vector_boundary_configuration_is_rejected(monkeypatch):
    from src import event_vector_index
    from src.config import QDRANT_COLLECTION

    monkeypatch.setattr(event_vector_index, "EVENT_COLLECTION", QDRANT_COLLECTION)
    with pytest.raises(RuntimeError, match="event_vector_collection_must_be_separate"):
        event_vector_index.validate_event_vector_boundary()
    monkeypatch.setattr(event_vector_index, "EVENT_COLLECTION", f"{QDRANT_COLLECTION}_events")
    monkeypatch.setattr(event_vector_index, "EVENT_NAMESPACE", "__default__")
    with pytest.raises(RuntimeError, match="event_vector_namespace_must_be_separate"):
        event_vector_index.validate_event_vector_boundary()


def test_local_event_store_cannot_reuse_chunk_database_path(tmp_path, monkeypatch):
    from src import master_event_store

    shared = tmp_path / "shared.db"
    monkeypatch.setattr("src.chunk_store.CHUNKS_DB", shared)
    with pytest.raises(RuntimeError, match="event_store_must_be_separate_from_chunk_store"):
        master_event_store.MasterEventStore(duckdb_path=shared)


def test_event_vector_deletion_targets_only_event_collection_and_project_document():
    from src.event_vector_index import EVENT_COLLECTION, EventVectorIndex

    calls = []
    index = EventVectorIndex.__new__(EventVectorIndex)
    index.backend = "qdrant"
    index.rag = SimpleNamespace(qdrant_client=SimpleNamespace(
        delete=lambda **kwargs: calls.append(kwargs),
    ))

    index.delete_document(project_id="project-a", doc_id="document-a")

    assert calls[0]["collection_name"] == EVENT_COLLECTION
    conditions = calls[0]["points_selector"].filter.must
    assert {(item.key, item.match.value) for item in conditions} == {
        ("project_id", "project-a"), ("doc_id", "document-a"),
    }


def test_event_pinecone_deletion_uses_reserved_event_namespace():
    from src.event_vector_index import EVENT_NAMESPACE, EventVectorIndex

    calls = []
    index = EventVectorIndex.__new__(EventVectorIndex)
    index.backend = "pinecone"
    index.rag = SimpleNamespace(pinecone_index=SimpleNamespace(
        delete=lambda **kwargs: calls.append(kwargs),
    ))

    index.delete_document(project_id="project-a", doc_id="document-a")

    assert calls == [{
        "namespace": EVENT_NAMESPACE,
        "filter": {"project_id": {"$eq": "project-a"}, "doc_id": {"$eq": "document-a"}},
    }]


def test_document_metadata_intentionally_shares_chunk_duckdb_connection(monkeypatch):
    from src.document_index import DocumentIndex

    sentinel = object()
    monkeypatch.setattr(
        "src.document_index.get_chunk_store",
        lambda: SimpleNamespace(connection=lambda: sentinel),
    )

    assert DocumentIndex().connection is sentinel

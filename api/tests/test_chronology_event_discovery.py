from __future__ import annotations

from types import SimpleNamespace

from src import chronology_discovery
from src.chronology_v2 import PreparedChronologyQuery
from src.evidence_model import EvidenceItem


def _prepared(topic="delay"):
    return PreparedChronologyQuery(
        original_query=topic, english_query=topic, jargon_matches=(), parties=(),
        contracts=(), work_packages=(), exclusions=(), research_queries=(topic,),
    )


def _prepared_with_parties(topic="delay"):
    return PreparedChronologyQuery(
        original_query=topic, english_query=topic, jargon_matches=(),
        parties=("Contractor", "Employer"), contracts=(), work_packages=(),
        exclusions=(), research_queries=(topic,),
    )


def _row(event_type="delay"):
    return {
        "observation_id": "obs1", "doc_id": "doc1", "file_name": "letter.pdf",
        "source_kind": "document", "source_locator": {"page": 2},
        "event_type": event_type, "claim_quote": "The works were delayed by access.",
        "date_evidence": "14 March 2024", "normalized_date": "2024-03-14", "score": .9,
    }


class FakeStore:
    def __init__(self, *, complete=True, rows=None, incomplete=None):
        self.complete = complete; self.rows = list(rows or []); self.incomplete = list(incomplete or [])

    def project_status(self, project_id):
        return {"complete": self.complete, "observation_count": len(self.rows),
                "partial_reasons": [] if self.complete else ["event_index_partial"]}

    def search_observations(self, **kwargs):
        return list(self.rows)

    def incomplete_documents(self, project_id):
        return list(self.incomplete)

    def observations_by_ids(self, **kwargs):
        return []

    def enqueue_gap_reindex(self, project_id, doc_ids):
        return list(doc_ids)


def test_complete_master_hit_does_not_call_legacy_fallback(monkeypatch):
    store = FakeStore(rows=[_row()])
    monkeypatch.setattr(chronology_discovery, "CHRONOLOGY_EVENT_DISCOVERY_MODE", "primary_fallback")
    monkeypatch.setattr("src.master_event_store.get_master_event_store", lambda: store)
    monkeypatch.setattr("src.event_vector_index.get_event_vector_index",
                        lambda: SimpleNamespace(search=lambda **kwargs: {}))
    called = []
    result = chronology_discovery.discover_chronology_evidence(
        project_id="p1", prepared=_prepared(), fallback=lambda queries, docs: called.append((queries, docs)) or [],
    )
    assert not called
    assert result.evidence[0].source_id == "evt_obs1"
    assert result.audit["fallback_hits"] == 0


def test_partial_index_scopes_fallback_to_incomplete_documents(monkeypatch):
    store = FakeStore(complete=False, rows=[_row()], incomplete=["missing-doc"])
    monkeypatch.setattr(chronology_discovery, "CHRONOLOGY_EVENT_DISCOVERY_MODE", "primary_fallback")
    monkeypatch.setattr("src.master_event_store.get_master_event_store", lambda: store)
    monkeypatch.setattr("src.event_vector_index.get_event_vector_index",
                        lambda: SimpleNamespace(search=lambda **kwargs: {}))
    scopes = []
    fallback_item = EvidenceItem(
        source_id="legacy1", doc_id="missing-doc", file_name="missing.pdf",
        excerpt="Delay notice evidence", score=.5,
    )
    result = chronology_discovery.discover_chronology_evidence(
        project_id="p1", prepared=_prepared(),
        fallback=lambda queries, docs: scopes.append(list(docs)) or [fallback_item],
    )
    assert scopes == [["missing-doc"]]
    assert {item.source_id for item in result.evidence} == {"evt_obs1", "legacy1"}
    assert "event_index_partial" in result.audit["partial_reasons"]


def test_audit_mode_reports_master_but_preserves_legacy_output(monkeypatch):
    store = FakeStore(rows=[_row()])
    monkeypatch.setattr(chronology_discovery, "CHRONOLOGY_EVENT_DISCOVERY_MODE", "audit")
    monkeypatch.setattr("src.master_event_store.get_master_event_store", lambda: store)
    monkeypatch.setattr("src.event_vector_index.get_event_vector_index",
                        lambda: SimpleNamespace(search=lambda **kwargs: {}))
    legacy = EvidenceItem(source_id="legacy", doc_id="doc2", file_name="old.pdf", excerpt="old")
    result = chronology_discovery.discover_chronology_evidence(
        project_id="p1", prepared=_prepared(), fallback=lambda queries, docs: [legacy],
    )
    assert [item.source_id for item in result.evidence] == ["legacy"]
    assert [item.source_id for item in result.master_evidence] == ["evt_obs1"]


def test_counter_observation_prevents_counter_gap_fallback(monkeypatch):
    counter = {
        **_row("party_position"), "observation_id": "counter1",
        "action_text": "The Employer denied the Contractor's position.",
        "claim_quote": "The Employer denied the Contractor's position.",
        "party_position": "denied",
    }
    store = FakeStore(rows=[_row(), counter])
    monkeypatch.setattr(chronology_discovery, "CHRONOLOGY_EVENT_DISCOVERY_MODE", "primary_fallback")
    monkeypatch.setattr("src.master_event_store.get_master_event_store", lambda: store)
    monkeypatch.setattr("src.event_vector_index.get_event_vector_index",
                        lambda: SimpleNamespace(search=lambda **kwargs: {}))
    called = []
    result = chronology_discovery.discover_chronology_evidence(
        project_id="p1", prepared=_prepared_with_parties(),
        fallback=lambda queries, docs: called.append((queries, docs)) or [],
    )
    assert not called
    assert result.audit["counter_observation_hits"] == 1
    assert "master_counter_evidence_gap" not in result.audit["partial_reasons"]


def test_counter_gap_fallback_is_scoped_to_related_documents(monkeypatch):
    store = FakeStore(rows=[_row()])
    monkeypatch.setattr(chronology_discovery, "CHRONOLOGY_EVENT_DISCOVERY_MODE", "primary_fallback")
    monkeypatch.setattr("src.master_event_store.get_master_event_store", lambda: store)
    monkeypatch.setattr("src.event_vector_index.get_event_vector_index",
                        lambda: SimpleNamespace(search=lambda **kwargs: {}))
    candidate = SimpleNamespace(doc_id="related-doc")
    monkeypatch.setattr("src.document_index.get_document_index", lambda: SimpleNamespace(
        search=lambda **kwargs: [candidate],
    ))
    scopes = []
    result = chronology_discovery.discover_chronology_evidence(
        project_id="p1", prepared=_prepared_with_parties(),
        fallback=lambda queries, docs: scopes.append(list(docs)) or [],
    )
    assert scopes == [["doc1", "related-doc"]]
    assert "master_counter_evidence_gap" in result.audit["partial_reasons"]

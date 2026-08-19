from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import duckdb
import pytest

from src.chronology_v2 import PreparedChronologyQuery
from src.chronology_v3 import (
    _events_valid, _final_valid, _style_valid, aggregate_events, evidence_from_documents,
    evidence_markdown, extract_events, prepare_chronology_query, research_documents,
)
from src.document_index import CandidateDocument, DocumentIndex, DocumentIndexRecord
from src.evidence_model import EvidenceItem


class MemoryChunkStore:
    def __init__(self):
        self._con = duckdb.connect(":memory:")
        self._con.execute(
            "CREATE TABLE chunks (chunk_id VARCHAR, doc_id VARCHAR, file_name VARCHAR, "
            "page_number INTEGER, text VARCHAR, project_id VARCHAR)"
        )
        self._con.execute(
            "CREATE TABLE document_index (search_id VARCHAR PRIMARY KEY, project_id VARCHAR, "
            "doc_id VARCHAR, file_name VARCHAR, reference VARCHAR, title VARCHAR, "
            "description VARCHAR, document_family VARCHAR, parties_json VARCHAR, "
            "topics_json VARCHAR, sheet_names_json VARCHAR, metadata_date VARCHAR, "
            "metadata_date_source VARCHAR, ocr_quality VARCHAR, content_hash VARCHAR, "
            "search_text VARCHAR, updated_at VARCHAR)"
        )
        self._dirty = False

    def connection(self):
        return self._con

    def _persist(self):
        return None


@pytest.fixture
def document_index(monkeypatch):
    store = MemoryChunkStore()
    monkeypatch.setattr("src.document_index.get_chunk_store", lambda: store)
    monkeypatch.setattr("src.chronology_v3.get_document_index", lambda: DocumentIndex())
    yield DocumentIndex(), store
    store._con.close()


def _record(project: str, doc_id: str, reference: str, title: str, family: str = "other",
            quality: str = "good") -> DocumentIndexRecord:
    return DocumentIndexRecord(
        project_id=project, doc_id=doc_id, file_name=f"{reference}.pdf",
        reference=reference, title=title, description=title,
        document_family=family, ocr_quality=quality, content_hash=f"hash-{doc_id}",
    )


def test_document_index_is_project_scoped_and_exact_map_documents_rank_first(document_index):
    index, _ = document_index
    index.upsert(_record("demo-a", "sds", "CEC00307573", "SDS historical review", "overview"))
    index.upsert(_record("demo-a", "tie", "CEC02086351", "TIE audit report", "audit"))
    index.upsert(_record("demo-a", "mudfa", "CEC01891483", "MUDFA close-out review", "review"))
    index.upsert(_record("demo-b", "secret", "CEC00307573", "Other project's SDS review", "overview"))

    ranked = index.search(
        project_id="demo-a", topic="SDS design chronology",
        queries=["CEC00307573", "CEC02086351", "CEC01891483"], limit=10,
    )

    assert {item.doc_id for item in ranked[:3]} == {"sds", "tie", "mudfa"}
    assert all(item.doc_id != "secret" for item in ranked)
    assert ranked[0].doc_id == "sds"


def test_metadata_dates_are_rejected_but_content_and_table_dates_are_accepted():
    evidence = [EvidenceItem(
        source_id="src-1", doc_id="doc-1", file_name="notice.pdf",
        excerpt="Date: 14 March 2025. The Engineer issued Notice 17.",
    )]
    base = {
        "event_date": "2025-03-14", "date_precision": "exact",
        "date_evidence": "14 March 2025", "actor": "Engineer", "action": "issued",
        "established_fact": "The Engineer issued Notice 17.", "party_position": "",
        "analytical_inference": "", "immediate_consequence": "",
        "supporting_source_ids": ["src-1"], "counter_source_ids": [], "missing_records": [],
    }
    for prohibited in ("metadata", "publication_date", "index_date", "manifest"):
        assert not _events_valid({"entries": [{**base, "date_source": prohibited}]}, evidence)
    assert _events_valid({"entries": [{**base, "date_source": "content_header"}]}, evidence)
    assert _events_valid({"entries": [{**base, "date_source": "content_body"}]}, evidence)
    assert _events_valid({"entries": [{**base, "date_source": "table_period"}]}, evidence)
    assert not _events_valid({"entries": [{
        **base, "event_date": "14 March 2025", "date_source": "content_header",
    }]}, evidence)


def test_v3_exact_cluster_preserves_observations_and_full_action_key():
    from copy import deepcopy
    shared = "x" * 130
    events = [
        {"event_date": "2025-03-14", "actor": "Engineer", "action": shared + suffix,
         "supporting_source_ids": [source], "counter_source_ids": [], "missing_records": []}
        for suffix, source in ((" first", "s1"), (" second", "s2"))
    ]
    duplicate = {**events[0], "supporting_source_ids": ["s3"]}
    original = deepcopy([*events, duplicate])

    result = aggregate_events([*events, duplicate], [], PreparedChronologyQuery(
        "q", "q", (), (), (), (), (), ("q",),
    ))

    assert len(result) == 2
    first = next(event for event in result if event["action"].endswith("first"))
    assert [item["supporting_source_ids"] for item in first["observations"]] == [["s1"], ["s3"]]
    assert [*events, duplicate] == original


def test_final_validation_rejects_invented_counter_source_id():
    evidence = [EvidenceItem(
        "s1", "d1", "notice.pdf", excerpt="14 March 2025 Engineer issued notice",
    )]
    value = {
        "overview_claims": [{
            "text": "Engineer issued notice", "source_ids": ["s1"],
            "counter_source_ids": ["invented"],
        }],
        "entries": [{
            "event_date": "2025-03-14", "date_source": "content_header",
            "date_evidence": "14 March 2025", "claims": [{
                "text": "Engineer issued notice", "source_ids": ["s1"],
                "counter_source_ids": [],
            }],
        }],
    }
    assert not _final_valid(value, evidence, enforce_style=False)


def test_verifier_receives_counter_evidence_and_issued_set_keeps_it(monkeypatch):
    from src.chronology_v3 import _issued_source_ids, verify_and_repair
    from src.evidence_model import ChronologyEntry, VerifiedClaim
    evidence = [
        EvidenceItem("support", "d1", "notice.pdf",
                     excerpt="14 March 2025 Engineer issued notice"),
        EvidenceItem("counter", "d2", "reply.pdf",
                     excerpt="Contractor disputed the notice"),
    ]
    chronology = {
        "overview_claims": [{
            "text": "Engineer issued notice", "source_ids": ["support"],
            "counter_source_ids": ["counter"],
        }],
        "entries": [{
            "event_date": "2025-03-14", "date_precision": "exact",
            "date_source": "content_header", "date_evidence": "14 March 2025",
            "claims": [{
                "text": "Engineer issued notice", "source_ids": ["support"],
                "counter_source_ids": ["counter"],
            }],
        }],
    }
    captured = {}

    def fake(prompt, **_kwargs):
        captured["prompt"] = prompt
        return SimpleNamespace(raw={"decisions": [
            {"claim_ref": "overview:0", "decision": "PASS", "reason_code": "supported"},
            {"claim_ref": "event:0:0", "decision": "PASS", "reason_code": "supported"},
        ]})

    monkeypatch.setattr("src.llm_client.generate_response_json", fake)
    prepared = PreparedChronologyQuery("q", "q", (), (), (), (), (), ("q",))
    result, _audit = verify_and_repair(chronology, evidence, prepared, cache_context="c")

    assert "Contractor disputed the notice" in captured["prompt"]
    assert result["entries"][0]["claims"][0]["counter_source_ids"] == ["counter"]
    entries = [ChronologyEntry(
        "", "2025-03-14", "exact",
        [VerifiedClaim("Engineer issued notice", ["support"], counter_source_ids=["counter"])],
    )]
    assert _issued_source_ids(entries) == {"support", "counter"}


@pytest.mark.parametrize("event_count", [1, 18, 19, 40])
def test_v3_synthesis_keeps_every_cluster_around_the_old_limit(monkeypatch, event_count):
    from src.chronology_v3 import SYNTHESIS_BATCH_EVENTS, synthesize

    def label(index: int) -> str:
        return chr(97 + index // 26) + chr(97 + index % 26)

    event_text = " ".join(["Engineer"] * 30)
    overview_text = " ".join(["Engineer"] * 90)
    evidence = [EvidenceItem(
        f"s-{label(i)}", f"d-{label(i)}", f"{label(i)}.pdf",
        excerpt=f"14 March 2025 {overview_text}",
    ) for i in range(event_count)]
    raw_events = [{
        "event_date": "2025-03-14", "date_precision": "exact",
        "date_source": "content_header", "date_evidence": "14 March 2025",
        "actor": "Engineer", "action": f"issued notice {label(i)}",
        "established_fact": "Engineer issued notice", "party_position": "",
        "analytical_inference": "", "immediate_consequence": "",
        "supporting_source_ids": [f"s-{label(i)}"], "counter_source_ids": [],
        "missing_records": [],
    } for i in range(event_count)]
    events = aggregate_events(raw_events, evidence, PreparedChronologyQuery(
        "q", "q", (), (), (), (), (), ("q",),
    ))
    calls = []

    def fake(prompt, **kwargs):
        calls.append(kwargs["schema_name"])
        if kwargs["schema_name"] == "chronology_v3_overview":
            return SimpleNamespace(raw={"overview_claims": [{
                "text": overview_text, "source_ids": ["s-aa"],
                "counter_source_ids": [],
            }]})
        raw = prompt.split("VERIFIED LEDGER BATCH:\n", 1)[1].split(
            "\n\nEVIDENCE BEGIN", 1,
        )[0]
        batch = json.loads(raw)
        return SimpleNamespace(raw={"entries": [{
            "cluster_id": event["cluster_id"], "event_date": event["event_date"],
            "date_precision": "exact", "date_source": "content_header",
            "date_evidence": "14 March 2025", "claims": [{
                "text": event_text,
                "source_ids": event["supporting_source_ids"], "counter_source_ids": [],
            }], "parties": [], "event_type": "event", "conflicting_positions": [],
        } for event in batch]})

    monkeypatch.setattr("src.llm_client.generate_response_json", fake)
    prepared = PreparedChronologyQuery("q", "q", (), (), (), (), (), ("q",))
    result = synthesize(events, evidence, prepared, cache_context="c")

    assert len(result["entries"]) == event_count
    assert calls.count("chronology_v3_event_batch") == (
        event_count + SYNTHESIS_BATCH_EVENTS - 1
    ) // SYNTHESIS_BATCH_EVENTS


def test_v3_synthesis_rejects_a_missing_cluster_id(monkeypatch):
    from src.chronology_v3 import synthesize
    evidence = [EvidenceItem(
        "s1", "d1", "a.pdf", excerpt="14 March 2025 Engineer issued notice",
    )]
    events = aggregate_events([{
        "event_date": "2025-03-14", "date_precision": "exact",
        "date_source": "content_header", "date_evidence": "14 March 2025",
        "actor": "Engineer", "action": "issued", "supporting_source_ids": ["s1"],
        "counter_source_ids": [], "missing_records": [],
    }], evidence, PreparedChronologyQuery("q", "q", (), (), (), (), (), ("q",)))

    def fake(_prompt, **kwargs):
        if kwargs["schema_name"] == "chronology_v3_overview":
            return SimpleNamespace(raw={"overview_claims": [{
                "text": "Engineer issued notice", "source_ids": ["s1"],
            }]})
        return SimpleNamespace(raw={"entries": []})

    monkeypatch.setattr("src.llm_client.generate_response_json", fake)
    with pytest.raises(ValueError, match="model_output_invalid"):
        synthesize(
            events, evidence, PreparedChronologyQuery("q", "q", (), (), (), (), (), ("q",)),
            cache_context="c",
        )


def test_v3_verifier_batches_more_than_thirty_claims(monkeypatch):
    from src.chronology_v3 import verify_and_repair
    evidence = [EvidenceItem(
        "s1", "d1", "a.pdf", excerpt="14 March 2025 Engineer issued notice",
    )]
    chronology = {
        "overview_claims": [{"text": "Engineer issued notice", "source_ids": ["s1"]}],
        "entries": [{
            "event_date": "2025-03-14", "date_precision": "exact",
            "date_source": "content_header", "date_evidence": "14 March 2025",
            "claims": [{"text": "Engineer issued notice", "source_ids": ["s1"]}],
        } for _ in range(40)],
    }
    batches = []

    def fake(prompt, **_kwargs):
        raw = prompt.split("CLAIMS:\n", 1)[1].split("\n\nEVIDENCE BEGIN", 1)[0]
        claims = json.loads(raw)
        batches.append(claims)
        return SimpleNamespace(raw={"decisions": [{
            "claim_ref": claim["claim_ref"], "decision": "PASS", "reason_code": "supported",
        } for claim in claims]})

    monkeypatch.setattr("src.llm_client.generate_response_json", fake)
    result, audit = verify_and_repair(
        chronology, evidence, PreparedChronologyQuery("q", "q", (), (), (), (), (), ("q",)),
        cache_context="c",
    )

    assert len(batches) == 2
    assert len(result["entries"]) == 40
    assert len(audit["decisions"]) == 41


def test_solicitor_style_gate_checks_overview_event_length_and_date_order():
    overview = " ".join(["contract"] * 100)
    event = " ".join(["record"] * 40)
    value = {
        "overview_claims": [{"text": overview}],
        "entries": [
            {"event_date": "2025-01-01", "claims": [{"text": event}]},
            {"event_date": "2025-02-01", "claims": [{"text": event}]},
        ],
    }
    assert _style_valid(value)
    assert not _style_valid({**value, "overview_claims": [{"text": "too short"}]})
    assert not _style_valid({**value, "entries": list(reversed(value["entries"]))})


def test_map_identifier_harvest_forces_a_second_document_search(monkeypatch):
    map_doc = CandidateDocument(
        doc_id="map", file_name="review.pdf", reference="MAP-1", title="Historical review",
        description="", document_family="overview", metadata_date="",
        metadata_date_source="unknown", ocr_quality="good", score=5, role="map", reasons=[],
    )
    notice = CandidateDocument(
        doc_id="notice", file_name="N-417.pdf", reference="NOTICE-417", title="Notice 417",
        description="", document_family="notice", metadata_date="",
        metadata_date_source="unknown", ocr_quality="good", score=7, role="primary", reasons=[],
    )

    class Index:
        calls = []

        def search(self, **kwargs):
            self.calls.append(list(kwargs["queries"]))
            return [map_doc] if len(self.calls) == 1 else [notice, map_doc]

        def list_project(self, _project_id):
            return [
                _record("p1", "map", "MAP-1", "Historical review", "overview"),
                _record("p1", "notice", "NOTICE-417", "Notice 417", "notice"),
            ]

    index = Index()
    monkeypatch.setattr("src.chronology_v3.get_document_index", lambda: index)
    monkeypatch.setattr("src.chronology_v3.evidence_from_documents", lambda _p, ids, scores=None: [
        EvidenceItem(source_id=f"src-{doc_id}", doc_id=doc_id, file_name=f"{doc_id}.pdf",
                     excerpt="14 March 2025 Notice 417",
                     score=(scores or {}).get(doc_id, 0.0)) for doc_id in ids
    ])
    monkeypatch.setattr("src.chronology_v3._map_extract", lambda *_args, **_kwargs: {
        "skeleton": ["notice"],
        "leads": [{"kind": "notice", "value": "NOTICE-417",
                   "suggested_query": "NOTICE-417", "source_id": "src-map"}],
    })
    monkeypatch.setattr("src.chronology_v3.coverage_matrix", lambda _e: {"framework": 1})
    prepared = PreparedChronologyQuery(
        original_query="delay", english_query="delay", jargon_matches=(), parties=(),
        contracts=(), work_packages=(), exclusions=(), research_queries=("delay overview",),
    )

    selected, _, audit = research_documents("p1", prepared)

    assert any("NOTICE-417" in query for query in index.calls[1])
    assert {item.doc_id for item in selected} == {"map", "notice"}
    assert audit["research_leads"][0]["value"] == "NOTICE-417"


def test_unreadable_title_only_document_is_never_loaded_as_evidence(document_index):
    index, _ = document_index
    index.upsert(_record(
        "demo-a", "empty", "NOTICE-9", "Notice concerning delay", "notice", "unreadable",
    ))
    ranked = index.search(
        project_id="demo-a", topic="delay", queries=["NOTICE-9"], limit=10,
    )
    assert ranked and ranked[0].ocr_quality == "unreadable"
    from src.chronology_v3 import _select
    assert _select(ranked) == []


def test_excel_parquet_becomes_sheet_and_row_addressable_evidence(
    document_index, monkeypatch, tmp_path: Path,
):
    pd = pytest.importorskip("pandas")
    index, store = document_index
    index.upsert(DocumentIndexRecord(
        project_id="demo-a", doc_id="sheet-1", file_name="progress.xlsx",
        title="Progress register", description="weekly progress", document_family="schedule",
        sheet_names=["Period 01"], ocr_quality="table", content_hash="table-hash",
    ))
    parquet = tmp_path / "progress.parquet"
    pd.DataFrame({"Date": ["14 March 2025", "21 March 2025"], "Progress": [40, 55]}).to_parquet(parquet)
    table = SimpleNamespace(
        parquet_path=str(parquet), page_number=None, sheet_name="Period 01",
        table_name="t_progress", table_id="progress-1",
    )
    catalog = SimpleNamespace(entries={"entry": SimpleNamespace(
        project_id="demo-a", source_file="/old/host/progress.xlsx",
        source_type="excel", tables=[table],
    )})
    monkeypatch.setattr("src.catalog.get_catalog", lambda: catalog)
    monkeypatch.setattr("src.chronology_v3.get_chunk_store", lambda: store, raising=False)
    # evidence_from_documents imports the symbol directly from src.chunk_store.
    monkeypatch.setattr("src.chunk_store.get_chunk_store", lambda: store)

    evidence = evidence_from_documents("demo-a", ["sheet-1"])

    assert len(evidence) == 1
    assert evidence[0].kind == "excel"
    assert evidence[0].sheet == "Period 01"
    assert (evidence[0].row_from, evidence[0].row_to) == (2, 3)
    assert "| Date | Progress |" in evidence[0].excerpt
    assert "TABLE sheet=Period 01 rows=2-3" in evidence_markdown(evidence)


def test_validated_extraction_checkpoint_skips_provider_call(monkeypatch):
    evidence = [EvidenceItem(
        source_id="src-1", doc_id="doc-1", file_name="notice.pdf",
        excerpt="Date: 14 March 2025. The Engineer issued Notice 17.",
    )]
    prepared = PreparedChronologyQuery(
        original_query="delay", english_query="delay", jargon_matches=(), parties=(),
        contracts=(), work_packages=(), exclusions=(), research_queries=("delay",),
    )
    saved = {"entries": [{
        "event_date": "2025-03-14", "date_precision": "exact",
        "date_source": "content_header", "date_evidence": "14 March 2025",
        "actor": "Engineer", "action": "issued", "established_fact": "Notice 17",
        "party_position": "", "analytical_inference": "", "immediate_consequence": "",
        "supporting_source_ids": ["src-1"], "counter_source_ids": [], "missing_records": [],
    }]}
    monkeypatch.setattr(
        "src.llm_client.generate_response_json",
        lambda *_args, **_kwargs: pytest.fail("provider must not run for a ready checkpoint"),
    )

    result = extract_events(
        evidence, prepared,
        load_step=lambda _key, _hash: {"status": "ready", "output": saved},
    )

    assert result == saved["entries"]


def test_credit_exhaustion_is_not_swallowed_by_planner_fallback(monkeypatch):
    from src.billing_store import CreditBalanceExceededError
    monkeypatch.setattr(
        "src.llm_client.generate_response_json",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(CreditBalanceExceededError("demo_user")),
    )
    with pytest.raises(CreditBalanceExceededError):
        prepare_chronology_query("contract delay", project_id="demo-a")


def test_provider_timeout_does_not_trigger_recursive_batch_split(monkeypatch):
    evidence = [
        EvidenceItem(source_id=f"src-{index}", doc_id=f"doc-{index}",
                     file_name=f"notice-{index}.pdf", excerpt="14 March 2025 Notice")
        for index in range(2)
    ]
    prepared = PreparedChronologyQuery(
        original_query="delay", english_query="delay", jargon_matches=(), parties=(),
        contracts=(), work_packages=(), exclusions=(), research_queries=("delay",),
    )
    calls = []
    saved = {}

    def save(key, _input_hash, status, _output, error):
        saved[key] = (status, error)

    monkeypatch.setattr(
        "src.llm_client.generate_response_json",
        lambda *_args, **_kwargs: (calls.append(1), (_ for _ in ()).throw(
            RuntimeError("provider timeout secret diagnostic")
        ))[1],
    )
    with pytest.raises(RuntimeError, match="provider timeout secret diagnostic"):
        extract_events(evidence, prepared, save_step=save)
    assert len(calls) == 1
    assert saved["extract:1"] == ("failed", "provider_timeout")


def test_gap_round_reread_preserves_document_scores(monkeypatch):
    primary = CandidateDocument(
        doc_id="primary", file_name="primary.pdf", reference="P", title="Primary",
        description="", document_family="notice", metadata_date="",
        metadata_date_source="unknown", ocr_quality="good", score=9, role="primary",
        reasons=[],
    )
    gap = CandidateDocument(
        doc_id="gap", file_name="gap.pdf", reference="G", title="Gap",
        description="", document_family="letter", metadata_date="",
        metadata_date_source="unknown", ocr_quality="good", score=4, role="corroborator",
        reasons=[],
    )

    class Index:
        calls = 0
        def search(self, **_kwargs):
            self.calls += 1
            return [primary] if self.calls <= 2 else [gap]
        def list_project(self, _project_id):
            return []

    seen_scores = []
    monkeypatch.setattr("src.chronology_v3.get_document_index", lambda: Index())
    monkeypatch.setattr("src.chronology_v3._map_extract", lambda *_a, **_k: {
        "skeleton": [], "leads": [],
    })

    def evidence(_project, ids, scores=None):
        seen_scores.append(dict(scores or {}))
        return [EvidenceItem(
            f"src-{doc_id}", doc_id, f"{doc_id}.pdf",
            excerpt="contract notice", score=float((scores or {}).get(doc_id, 0)),
        ) for doc_id in ids]

    monkeypatch.setattr("src.chronology_v3.evidence_from_documents", evidence)
    coverage_calls = 0

    def coverage(_evidence):
        nonlocal coverage_calls
        coverage_calls += 1
        return {"framework": 1, "missing": 0 if coverage_calls == 1 else 1}

    monkeypatch.setattr("src.chronology_v3.coverage_matrix", coverage)
    monkeypatch.setattr("src.chronology_v3.select_pack", lambda evidence, facets: SimpleNamespace(
        evidence=list(evidence), stats={},
    ))
    prepared = PreparedChronologyQuery("q", "q", (), (), (), (), (), ("q",))

    research_documents("p", prepared)

    assert any(values.get("primary") == 9 for values in seen_scores)
    assert any(values.get("gap") == 4 for values in seen_scores)


def test_post_verification_removal_does_not_reapply_style_gate(monkeypatch):
    from src.chronology_v3 import verify_and_repair
    evidence = [EvidenceItem(
        "s1", "d1", "notice.pdf", excerpt="14 March 2025 Engineer issued notice",
    )]
    chronology = {
        "overview_claims": [
            {"text": "Engineer issued notice", "source_ids": ["s1"]},
            {"text": "unsupported overview", "source_ids": ["s1"]},
        ],
        "entries": [{
            "event_date": "2025-03-14", "date_precision": "exact",
            "date_source": "content_header", "date_evidence": "14 March 2025",
            "claims": [{"text": "Engineer issued notice", "source_ids": ["s1"]}],
            "parties": [], "event_type": "event", "conflicting_positions": [],
        }],
    }
    decisions = {"decisions": [
        {"claim_ref": "overview:0", "decision": "PASS", "reason_code": "supported"},
        {"claim_ref": "overview:1", "decision": "REMOVE", "reason_code": "unsupported"},
        {"claim_ref": "event:0:0", "decision": "PASS", "reason_code": "supported"},
    ]}
    monkeypatch.setattr(
        "src.llm_client.generate_response_json",
        lambda *_a, **_k: SimpleNamespace(raw=decisions),
    )
    prepared = PreparedChronologyQuery("q", "q", (), (), (), (), (), ("q",))

    result, _audit = verify_and_repair(chronology, evidence, prepared, cache_context="c")

    assert len(result["overview_claims"]) == 1


def test_demo_plan_routes_to_v3_while_legacy_stays_v2(monkeypatch):
    from backend.api import reports

    class Billing:
        plan = "demo"

        def summary(self, _username):
            return {"plan_type": self.plan}

    billing = Billing()
    monkeypatch.setattr(
        "src.user_store.get_user_store", lambda: SimpleNamespace(billing=billing),
    )
    assert reports._chronology_pipeline("demo_user") == "chronology-v3"
    billing.plan = "legacy"
    assert reports._chronology_pipeline("admin2") == "chronology-v2"


def test_normal_report_contract_redacts_research_and_cost_diagnostics():
    from backend.api.reports import _public

    public = _public({
        "job_id": "job-1", "status": "ready", "coverage_status": "partial",
        "result": {
            "entries": [{"event_date": "2025-03-14"}],
            "evidence": [{"source_id": "src-1", "doc_id": "doc-1"}],
            "coverage_status": "partial", "partial_reasons": ["thin_record"],
            "research_audit": {"queries": ["secret"]},
            "verification_audit": {"decisions": []},
            "render_audit": {"paragraphs": 2}, "model": "gemini-3.6-flash",
            "prompt_version": "chronology-v3", "provider_cost_usd": 1.2,
            "pack": {"chars": 24500, "batches_failed": 2},
        },
    })

    # coverage_status and partial_reasons are deliberately part of the user
    # contract: a report that read only part of its evidence must be able to
    # say so. Everything else — research plans, verification internals, pack
    # sizes, model names, cost — stays redacted.
    assert set(public["result"]) == {
        "entries", "evidence", "coverage_status", "partial_reasons",
    }
    assert public["result"]["coverage_status"] == "partial"
    assert "pack" not in public["result"]
    # Unknown monetary fields must not leak even if a future pipeline adds one.
    assert "provider_cost_usd" not in public["result"]

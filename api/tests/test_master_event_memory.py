from __future__ import annotations

import hashlib
from types import SimpleNamespace

from src import canonical_artifacts
from src.canonical_artifacts import CanonicalSegment, segments_from_pages, write_canonical_artifact
from src.event_memory import ObservationDraft, discover_candidates, validate_draft
from src.master_event_store import MasterEventStore


def _segment(text: str) -> CanonicalSegment:
    return CanonicalSegment(
        ordinal=0, locator_type="page", locator={"page": 1}, text=text,
        segment_id="seg-1", text_sha256=hashlib.sha256(text.encode()).hexdigest(),
    )


def _draft(window, *, date_role="notice_sent") -> ObservationDraft:
    text = window.text
    actor = "Contractor"
    claim = "Contractor notified Engineer of a 10 day delay"
    signal = window.date_signals[0]
    return ObservationDraft(
        window_id=window.window_id, event_type="notice", actor=actor,
        actor_start=text.index(actor), actor_end=text.index(actor) + len(actor),
        action_text="notified Engineer of a 10 day delay", object_text="10 day delay",
        materiality="high", confidence="high", claim_start=text.index(claim),
        claim_end=text.index(claim) + len(claim), normalized_date=signal.normalized,
        date_precision=signal.precision, date_role=date_role,
        date_start=signal.start, date_end=signal.end,
    )


def test_canonical_artifact_is_stable_and_span_addressable(tmp_path, monkeypatch):
    monkeypatch.setattr(canonical_artifacts, "CANONICAL_ROOT", tmp_path / "canonical")
    segments = segments_from_pages({1: "On 14 March 2024, work commenced."})
    first = write_canonical_artifact(
        project_id="p1", doc_id="d1", file_name="letter.pdf",
        source_kind="document", segments=segments,
    )
    second = write_canonical_artifact(
        project_id="p1", doc_id="d1", file_name="letter.pdf",
        source_kind="document", segments=segments,
    )
    assert first.version_id == second.version_id
    assert first.canonical_sha256 == second.canonical_sha256
    assert first.segments[0].segment_id == second.segments[0].segment_id


def test_standard_gcs_uri_resolves_to_provider_object_name():
    assert canonical_artifacts._gcs_blob_name(
        "gs://evidence-bucket/canonical-events/p1/version/canonical-text.jsonl.gz"
    ) == "canonical-events/p1/version/canonical-text.jsonl.gz"


def test_date_span_and_project_scoped_cluster_identity():
    segment = _segment("On 14 March 2024, Contractor notified Engineer of a 10 day delay.")
    window = discover_candidates(segment)[0]
    first, reason = validate_draft(
        _draft(window), window, segment, project_id="project-a",
        prompt_hash="p", schema_hash="s", jargon_hash="j",
    )
    second, _ = validate_draft(
        _draft(window), window, segment, project_id="project-b",
        prompt_hash="p", schema_hash="s", jargon_hash="j",
    )
    assert reason == "accepted"
    assert first["date"]["evidence_text"] == "14 March 2024"
    assert first["claim_quote"] == segment.text[first["claim_start"]:first["claim_end"]]
    assert first["cluster"]["cluster_id"] != second["cluster"]["cluster_id"]


def test_document_date_is_not_promoted_to_event_date():
    segment = _segment("On 14 March 2024, Contractor notified Engineer of a 10 day delay.")
    window = discover_candidates(segment)[0]
    value, reason = validate_draft(
        _draft(window, date_role="document_date"), window, segment, project_id="p1",
        prompt_hash="p", schema_hash="s", jargon_hash="j",
    )
    assert reason == "accepted"
    assert value["date"] is None
    assert value["undated_material"] is True


def test_invalid_claim_span_is_rejected():
    segment = _segment("On 14 March 2024, Contractor notified Engineer of a 10 day delay.")
    window = discover_candidates(segment)[0]
    draft = _draft(window).model_copy(update={"claim_end": len(window.text) + 10})
    value, reason = validate_draft(
        draft, window, segment, project_id="p1",
        prompt_hash="p", schema_hash="s", jargon_hash="j",
    )
    assert value is None
    assert reason == "claim_span_invalid"


def test_relative_date_is_preserved_as_non_primary_undated_evidence():
    text = "Two weeks later, Contractor issued a delay notice."
    segment = _segment(text)
    window = discover_candidates(segment)[0]
    relative = next(item for item in window.date_signals if item.precision == "relative")
    claim = "Contractor issued a delay notice"
    draft = ObservationDraft(
        window_id=window.window_id, event_type="notice", actor="Contractor",
        actor_start=window.text.index("Contractor"),
        actor_end=window.text.index("Contractor") + len("Contractor"),
        action_text="issued a delay notice", materiality="high", confidence="high",
        claim_start=window.text.index(claim), claim_end=window.text.index(claim) + len(claim),
        normalized_date="", date_precision="relative", date_role="notice_sent",
        date_start=relative.start, date_end=relative.end,
    )
    value, reason = validate_draft(
        draft, window, segment, project_id="p1",
        prompt_hash="p", schema_hash="s", jargon_hash="j",
    )
    assert reason == "accepted"
    assert value["undated_material"] is True
    assert value["date"]["evidence_text"] == "Two weeks later"
    assert value["date"]["is_primary"] is False


def test_store_reingest_retires_old_version_and_purge_is_project_scoped(tmp_path, monkeypatch):
    monkeypatch.setattr(canonical_artifacts, "CANONICAL_ROOT", tmp_path / "canonical")
    store = MasterEventStore(duckdb_path=tmp_path / "events.db")
    first = write_canonical_artifact(
        project_id="p1", doc_id="same-doc", file_name="a.pdf", source_kind="document",
        segments=segments_from_pages({1: "First version 2024."}),
    )
    other = write_canonical_artifact(
        project_id="p2", doc_id="same-doc", file_name="a.pdf", source_kind="document",
        segments=segments_from_pages({1: "Other project 2024."}),
    )
    latest = write_canonical_artifact(
        project_id="p1", doc_id="same-doc", file_name="a.pdf", source_kind="document",
        segments=segments_from_pages({1: "Second version 2025."}),
    )
    store.register_artifact(first); store.register_artifact(other); store.register_artifact(latest)
    assert store.get_version("p1", first.version_id)["active"] is False
    assert store.get_version("p1", latest.version_id)["active"] is True
    uris = store.purge_document("p1", "same-doc")
    assert len(uris) == 2
    assert store.get_version("p2", other.version_id) is not None


def test_failed_claimed_job_reaches_terminal_state(tmp_path, monkeypatch):
    monkeypatch.setattr(canonical_artifacts, "CANONICAL_ROOT", tmp_path / "canonical")
    store = MasterEventStore(duckdb_path=tmp_path / "events.db")
    artifact = write_canonical_artifact(
        project_id="p1", doc_id="d1", file_name="a.pdf", source_kind="document",
        segments=segments_from_pages({1: "A notice was issued in 2024."}),
    )
    store.register_artifact(artifact); store.enqueue_index("p1", "d1", artifact.version_id)
    assert store.claim_index_job()["status"] == "processing"
    store.fail_index_job(project_id="p1", version_id=artifact.version_id,
                         error_code="report_generation_failed")
    assert store.get_version("p1", artifact.version_id)["event_index_status"] == "failed"


def test_backfill_grouping_never_uses_file_name():
    from scripts.backfill_master_events import grouped_chunk_rows, stratified_selection
    rows = [
        {"project_id": "p", "doc_id": "d1", "file_name": "same.pdf", "page_number": 1},
        {"project_id": "p", "doc_id": "d2", "file_name": "same.pdf", "page_number": 1},
        {"project_id": "q", "doc_id": "d1", "file_name": "same.pdf", "page_number": 1},
    ]
    assert set(grouped_chunk_rows(rows)) == {("p", "d1"), ("p", "d2"), ("q", "d1")}
    groups = grouped_chunk_rows([
        {"project_id": "p", "doc_id": "short", "file_name": "a.pdf", "text": "x"},
        {"project_id": "p", "doc_id": "sheet", "file_name": "b.xlsx", "text": "x"},
        {"project_id": "p", "doc_id": "long", "file_name": "c.pdf", "text": "x" * 100_001},
    ])
    selected = stratified_selection(groups, 3, {("p", "short"): {"ocr_pages": 1}})
    assert {key for key, _ in selected} == set(groups)


def test_eventless_document_metadata_uses_the_single_async_extraction_call(
    tmp_path, monkeypatch,
):
    from src import event_memory, event_vector_index
    monkeypatch.setattr(canonical_artifacts, "CANONICAL_ROOT", tmp_path / "canonical")
    store = MasterEventStore(duckdb_path=tmp_path / "events.db")
    artifact = write_canonical_artifact(
        project_id="p1", doc_id="d1", file_name="memo.txt", source_kind="document",
        segments=segments_from_pages({1: "General project memorandum with no event signals."}),
    )
    store.register_artifact(artifact); store.enqueue_index("p1", "d1", artifact.version_id)
    calls = []

    def extraction(batch, **kwargs):
        calls.append((list(batch), kwargs["metadata_excerpt"], kwargs["classify_document"]))
        return event_memory.ObservationBatch(
            document_summary="General project memorandum.",
            document_topics=["project administration"], document_type="report",
        ), SimpleNamespace(prompt_tokens=20, completion_tokens=8, cost_estimate=.00001)

    fake_vectors = SimpleNamespace(
        delete_document=lambda **kwargs: None,
        index_observations=lambda **kwargs: 0,
    )
    monkeypatch.setattr(event_memory, "_extract_batch", extraction)
    monkeypatch.setattr(event_vector_index, "get_event_vector_index", lambda: fake_vectors)
    result = event_memory.index_document_events("p1", artifact.version_id, store=store)
    assert result["status"] == "ready"
    assert len(calls) == 1
    assert calls[0][0] == []
    assert calls[0][1] == "General project memorandum with no event signals."
    assert calls[0][2] is True
    metrics = store.project_metrics("p1")
    assert metrics["segments"] == 1
    assert metrics["model_usage"]["input_tokens"] == 20
    assert metrics["audit_dispositions"]["scanned"] == 1

import pytest
from fastapi import HTTPException

from backend.api import reports
from backend.tasks.report_jobs import ReportJobStore


class _User:
    username = "analyst@example.com"


class _Project:
    project_id = "proj-1"


def _ready_job(store: ReportJobStore) -> str:
    job = store.enqueue(project_id="proj-1", username="analyst@example.com",
                        module="chronology", title="utility diversion", request={})
    store.complete(job["job_id"], {
        "entries": [
            {"entry_ref": "6.1.1", "event_date": "2005-09-19", "claims": []},
            {"entry_ref": "6.1.2", "event_date": "2007-11-25", "claims": []},
        ],
        "evidence": [],
        "research_audit": {"candidates": [{"doc_id": "a"}, {"doc_id": "b"}, {"doc_id": "c"}]},
    }, "")
    return job["job_id"]


@pytest.fixture
def store(tmp_path, monkeypatch):
    instance = ReportJobStore(tmp_path / "reports.db")
    monkeypatch.setattr(reports, "get_report_job_store", lambda: instance)
    return instance


def _review(job_id, refs, reviewed=True):
    return reports.update_chronology_review(
        job_id, reports.ChronologyReviewUpdate(entry_refs=refs, reviewed=reviewed),
        user=_User(), project=_Project(),
    )


def test_marks_entries_verified_and_exposes_them(store):
    job_id = _ready_job(store)
    public = _review(job_id, ["6.1.2"])
    reviews = public["result"]["reviews"]
    assert list(reviews) == ["6.1.2"]
    assert reviews["6.1.2"]["by"] == "analyst@example.com"
    assert public["result"]["documents_considered"] == 3
    assert "research_audit" not in public["result"]


def test_unverify_removes_the_mark(store):
    job_id = _ready_job(store)
    _review(job_id, ["6.1.1", "6.1.2"])
    public = _review(job_id, ["6.1.1"], reviewed=False)
    assert list(public["result"]["reviews"]) == ["6.1.2"]


def test_rejects_unknown_entries_and_other_projects(store):
    job_id = _ready_job(store)
    with pytest.raises(HTTPException) as unknown:
        _review(job_id, ["9.9.9"])
    assert unknown.value.status_code == 422

    class Other:
        project_id = "proj-2"

    with pytest.raises(HTTPException) as missing:
        reports.update_chronology_review(
            job_id, reports.ChronologyReviewUpdate(entry_refs=["6.1.1"]),
            user=_User(), project=Other(),
        )
    assert missing.value.status_code == 404

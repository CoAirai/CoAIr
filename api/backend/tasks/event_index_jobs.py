"""Workers for the PostgreSQL-backed, restart-safe master-event queue."""
from __future__ import annotations

import threading

from src.config import EVENT_INDEX_ENABLED, EVENT_INDEX_MAX_CONCURRENCY


_stop = threading.Event()
_threads: list[threading.Thread] = []
_manager_lock = threading.Lock()


def _worker() -> None:
    from src.master_event_store import get_master_event_store
    store = get_master_event_store()
    while not _stop.is_set():
        job = store.claim_index_job()
        if not job:
            _stop.wait(.75)
            continue
        project_id = str(job["project_id"])
        doc_id = str(job["doc_id"])
        version_id = str(job["version_id"])
        try:
            from backend.core.security import set_current_user_context
            from src.project_context import set_current_project
            set_current_user_context(str(job.get("requested_by") or ""))
            set_current_project(project_id, "editor")
            from src.event_memory import index_document_events
            details = index_document_events(project_id, version_id, store=store)
            status = store.get_version(project_id, version_id) or {}
            from src.document_registry import get_document_registry
            get_document_registry().set_event_index(
                doc_id, search_status="ready", status=str(status.get("event_index_status") or "ready"),
                observation_count=int(status.get("observation_count") or 0),
                cluster_count=int(status.get("cluster_count") or 0),
                version=str(status.get("event_index_version") or "master-events-v1"),
                partial_reasons=list(status.get("partial_reasons") or []),
            )
            try:
                from backend.tasks.ingestion_jobs import get_ingestion_job_store
                ingest = get_ingestion_job_store().get_by_file(doc_id, project_id)
                if ingest:
                    get_ingestion_job_store().update(
                        ingest["job_id"], details={
                            "event_index_status": status.get("event_index_status"),
                            "event_observation_count": status.get("observation_count", 0),
                            "event_cluster_count": status.get("cluster_count", 0),
                            "event_partial_reasons": status.get("partial_reasons", []),
                            "event_index_metrics": details,
                        },
                    )
            except Exception:
                pass
        except Exception as exc:
            try:
                from src.report_errors import classify_report_error
                store.fail_index_job(
                    project_id=project_id, version_id=version_id,
                    error_code=classify_report_error(exc),
                )
            except Exception:
                pass
            try:
                from src.document_registry import get_document_registry
                get_document_registry().set_event_index(
                    doc_id, search_status="ready", status="failed",
                    partial_reasons=["event_index_failed"],
                )
            except Exception:
                pass


def start_event_index_workers() -> None:
    if not EVENT_INDEX_ENABLED:
        return
    with _manager_lock:
        if any(thread.is_alive() for thread in _threads):
            return
        from src.master_event_store import get_master_event_store
        get_master_event_store().recover_interrupted_jobs()
        _stop.clear()
        for index in range(max(1, int(EVENT_INDEX_MAX_CONCURRENCY))):
            thread = threading.Thread(
                target=_worker, name=f"event-index-{index + 1}", daemon=True,
            )
            thread.start(); _threads.append(thread)


def stop_event_index_workers() -> None:
    _stop.set()
    for thread in list(_threads):
        thread.join(timeout=2)
    _threads.clear()


__all__ = ["start_event_index_workers", "stop_event_index_workers"]

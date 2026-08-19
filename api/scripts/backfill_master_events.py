#!/usr/bin/env python3
"""Build immutable legacy canonical artifacts from the existing chunk store.

The safety default is a dry run. Grouping is always (project_id, doc_id); file
names are presentation metadata and are never document identities.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Tuple


def grouped_chunk_rows(rows: Iterable[Mapping]) -> Dict[Tuple[str, str], List[Dict]]:
    grouped: Dict[Tuple[str, str], List[Dict]] = defaultdict(list)
    for raw in rows:
        row = dict(raw)
        project_id = str(row.get("project_id") or "").strip()
        doc_id = str(row.get("doc_id") or "").strip()
        if not project_id or not doc_id:
            continue
        grouped[(project_id, doc_id)].append(row)
    for values in grouped.values():
        values.sort(key=lambda item: (
            int(item.get("page_number") or 1), str(item.get("chunk_id") or ""),
        ))
    return dict(grouped)


def load_groups(project_id: str = "") -> Dict[Tuple[str, str], List[Dict]]:
    from src.chunk_store import get_chunk_store
    con = get_chunk_store().connection()
    sql = ("SELECT project_id,doc_id,file_name,page_number,text,chunk_id "
           "FROM chunks WHERE project_id<>'' AND doc_id<>''")
    params: List[str] = []
    if project_id:
        sql += " AND project_id=?"; params.append(project_id)
    rows = con.execute(sql, params).fetchall()
    columns = [item[0] for item in con.description]
    return grouped_chunk_rows(dict(zip(columns, row)) for row in rows)


def stratified_selection(
    groups: Dict[Tuple[str, str], List[Dict]], limit: int,
    registry_meta: Mapping[Tuple[str, str], Mapping] | None = None,
) -> List[Tuple[Tuple[str, str], List[Dict]]]:
    """Deterministic round-robin by type, length and OCR/native lane."""
    strata: Dict[Tuple[str, str, str], List[Tuple[Tuple[str, str], List[Dict]]]] = defaultdict(list)
    metadata = registry_meta or {}
    for key, rows in sorted(groups.items()):
        file_name = str(rows[0].get("file_name") or "")
        extension = Path(file_name).suffix.casefold() or "unknown"
        chars = sum(len(str(row.get("text") or "")) for row in rows)
        length_band = "short" if chars < 10_000 else "medium" if chars < 100_000 else "long"
        record = metadata.get(key, {})
        ocr_band = "ocr" if int(record.get("ocr_pages") or 0) > 0 else "native_or_unknown"
        strata[(extension, length_band, ocr_band)].append((key, rows))
    selected: List[Tuple[Tuple[str, str], List[Dict]]] = []
    keys = sorted(strata)
    while keys and len(selected) < max(0, limit):
        remaining = []
        for key in keys:
            if strata[key] and len(selected) < limit:
                selected.append(strata[key].pop(0))
            if strata[key]:
                remaining.append(key)
        keys = remaining
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", default="")
    parser.add_argument("--limit", type=int, default=1000,
                        help="Maximum documents; default is the stratified-pilot size.")
    parser.add_argument("--apply", action="store_true",
                        help="Write artifacts and queue event extraction.")
    parser.add_argument("--run-now", action="store_true",
                        help="Process queued jobs inline (local/offline only).")
    args = parser.parse_args()
    groups = load_groups(args.project_id)
    registry_meta = {}
    try:
        from src.document_registry import get_document_registry
        registry_meta = {
            (record.project_id, record.doc_id): {"ocr_pages": getattr(record, "ocr_pages", 0)}
            for record in get_document_registry().get_all()
        }
    except Exception:
        pass
    selected = stratified_selection(groups, max(0, args.limit), registry_meta)
    chars = sum(len(str(row.get("text") or "")) for _, rows in selected for row in rows)
    print({"documents": len(selected), "chunks": sum(len(v) for _, v in selected),
           "characters": chars, "mode": "apply" if args.apply else "dry-run"})
    if not args.apply:
        return 0

    from src.canonical_artifacts import segments_from_legacy_chunks, write_canonical_artifact
    from src.master_event_store import get_master_event_store
    store = get_master_event_store()
    queued = []
    for (project_id, doc_id), rows in selected:
        artifact = write_canonical_artifact(
            project_id=project_id, doc_id=doc_id,
            file_name=str(rows[0].get("file_name") or doc_id), source_kind="legacy_chunk",
            segments=segments_from_legacy_chunks(rows),
        )
        store.register_artifact(artifact)
        store.enqueue_index(project_id, doc_id, artifact.version_id, requested_by="backfill")
        queued.append((project_id, artifact.version_id))
    if args.run_now:
        from src.event_memory import index_document_events
        while True:
            job = store.claim_index_job()
            if not job:
                break
            index_document_events(str(job["project_id"]), str(job["version_id"]), store=store)
    print({"queued": len(queued)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

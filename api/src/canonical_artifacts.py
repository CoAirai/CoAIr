"""Immutable canonical source artifacts for span-addressed event extraction.

The vector/chunk index is a search derivative and may be rebuilt.  Event spans
therefore target this immutable JSONL gzip artifact instead of a mutable vector
payload or model-authored quotation.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Sequence

from .config import STORAGE_DIR


CANONICAL_ROOT = Path(STORAGE_DIR) / "canonical_events"


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _safe(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or ""))
    return clean.strip("._")[:120] or "unknown"


def _gcs_blob_name(uri: str) -> str:
    """Translate a standard gs://bucket/object URI to this app's object name."""
    value = str(uri or "")
    if not value.startswith("gs://"):
        return value
    bucket_and_blob = value[5:]
    bucket, separator, blob = bucket_and_blob.partition("/")
    if not separator or not bucket or not blob:
        raise ValueError("canonical_artifact_gcs_uri_invalid")
    return blob


@dataclass(frozen=True)
class CanonicalSegment:
    ordinal: int
    locator_type: str
    locator: Dict[str, object]
    text: str
    overlapping: bool = False
    segment_id: str = ""
    text_sha256: str = ""


@dataclass(frozen=True)
class CanonicalArtifact:
    project_id: str
    doc_id: str
    file_name: str
    source_kind: str
    version_id: str
    content_sha256: str
    canonical_sha256: str
    uri: str
    local_path: str
    canonicalization_ms: float = 0.0
    segments: Sequence[CanonicalSegment] = field(default_factory=tuple)


def _normal_segments(rows: Iterable[CanonicalSegment]) -> List[CanonicalSegment]:
    result: List[CanonicalSegment] = []
    for index, row in enumerate(rows):
        text = str(row.text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
        if not text:
            continue
        locator = dict(row.locator)
        text_hash = _sha(text)
        result.append(CanonicalSegment(
            ordinal=len(result), locator_type=str(row.locator_type), locator=locator,
            text=text, overlapping=bool(row.overlapping),
            segment_id="", text_sha256=text_hash,
        ))
    return result


def segments_from_pages(page_texts: Mapping[int, str], *, source_kind: str = "document") -> List[CanonicalSegment]:
    return _normal_segments(
        CanonicalSegment(
            ordinal=index, locator_type="email_part" if source_kind == "email" else "page",
            locator={"page": int(page), "part": "body" if source_kind == "email" else "page"},
            text=str(text or ""),
        )
        for index, (page, text) in enumerate(sorted(page_texts.items()))
    )


def segments_from_email(parsed_email) -> List[CanonicalSegment]:
    """Keep mail headers and quoted history independently addressable."""
    headers = [
        f"From: {parsed_email.sender}" if parsed_email.sender else "",
        f"To: {', '.join(parsed_email.recipients)}" if parsed_email.recipients else "",
        f"CC: {', '.join(parsed_email.cc)}" if parsed_email.cc else "",
        f"Date: {parsed_email.date}" if parsed_email.date else "",
        f"Subject: {parsed_email.subject}" if parsed_email.subject else "",
    ]
    rows: List[CanonicalSegment] = []
    header_text = "\n".join(value for value in headers if value)
    if header_text:
        rows.append(CanonicalSegment(
            ordinal=0, locator_type="email_header", locator={"part": "header"},
            text=header_text,
        ))
    body = str(parsed_email.body_text or "")
    quoted = re.search(
        r"(?im)^(?:-{2,}\s*original message\s*-{2,}|on .+ wrote:|from:\s*.+)$", body,
    )
    parts = [("body", body[:quoted.start()] if quoted else body)]
    if quoted:
        parts.append(("quoted_message", body[quoted.start():]))
    for part, text in parts:
        for index, start in enumerate(range(0, len(text), 4000)):
            value = text[start:start + 4000]
            if value.strip():
                rows.append(CanonicalSegment(
                    ordinal=len(rows), locator_type="email_part",
                    locator={"part": part, "part_index": index}, text=value,
                ))
    return _normal_segments(rows)


def segments_from_legacy_chunks(rows: Iterable[Mapping[str, object]]) -> List[CanonicalSegment]:
    return _normal_segments(CanonicalSegment(
        ordinal=index, locator_type="legacy_chunk",
        locator={"chunk_id": str(row.get("chunk_id") or ""),
                 "page": int(row.get("page_number") or 1)},
        text=str(row.get("text") or ""), overlapping=True,
    ) for index, row in enumerate(rows))


def segments_from_data_file(path: str) -> List[CanonicalSegment]:
    """Serialize table rows deterministically; no OCR or model call is repeated."""
    import pandas as pd

    source = Path(path)
    sheets: Dict[str, object]
    if source.suffix.casefold() == ".csv":
        sheets = {"CSV": pd.read_csv(source)}
    else:
        sheets = pd.read_excel(source, sheet_name=None)
    rows: List[CanonicalSegment] = []
    for sheet_name, frame in sheets.items():
        columns = [str(value) for value in frame.columns]
        for row_number, values in enumerate(frame.itertuples(index=False, name=None), start=2):
            record = {columns[index]: ("" if value is None else str(value))
                      for index, value in enumerate(values)}
            text = " | ".join(f"{key}: {value}" for key, value in record.items() if value.strip())
            if text:
                rows.append(CanonicalSegment(
                    ordinal=len(rows), locator_type="sheet_row",
                    locator={"sheet": str(sheet_name), "row_from": row_number, "row_to": row_number},
                    text=text,
                ))
    return _normal_segments(rows)


def write_canonical_artifact(
    *, project_id: str, doc_id: str, file_name: str, source_kind: str,
    segments: Sequence[CanonicalSegment],
) -> CanonicalArtifact:
    started = time.perf_counter()
    clean = _normal_segments(segments)
    content_blob = "\n".join(
        json.dumps({"locator_type": row.locator_type, "locator": row.locator, "text": row.text},
                   sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        for row in clean
    )
    content_hash = _sha(content_blob)
    version_id = _sha(f"{project_id}{doc_id}{content_hash}")
    with_ids = [CanonicalSegment(
        ordinal=row.ordinal, locator_type=row.locator_type, locator=row.locator,
        text=row.text, overlapping=row.overlapping, text_sha256=row.text_sha256,
        segment_id=_sha(
            version_id
            + json.dumps(row.locator, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
            + row.text_sha256
        ),
    ) for row in clean]
    out_dir = CANONICAL_ROOT / _safe(project_id) / version_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "canonical-text.jsonl.gz"
    payload_lines = [json.dumps({
        "segment_id": row.segment_id, "ordinal": row.ordinal,
        "locator_type": row.locator_type, "locator": row.locator,
        "text_sha256": row.text_sha256, "overlapping": row.overlapping, "text": row.text,
    }, ensure_ascii=False, sort_keys=True) for row in with_ids]
    payload = ("\n".join(payload_lines) + ("\n" if payload_lines else "")).encode("utf-8")
    canonical_hash = hashlib.sha256(payload).hexdigest()
    if out_path.exists():
        with gzip.open(out_path, "rb") as handle:
            if hashlib.sha256(handle.read()).hexdigest() != canonical_hash:
                raise RuntimeError("canonical_artifact_hash_conflict")
    else:
        with out_path.open("wb") as raw:
            with gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=6, mtime=0) as handle:
                handle.write(payload)

    uri = str(out_path)
    try:
        from .gcs_storage import GCS_BUCKET_NAME, is_enabled, upload_file
        if is_enabled():
            blob = f"canonical-events/{_safe(project_id)}/{version_id}/canonical-text.jsonl.gz"
            if not upload_file(str(out_path), blob):
                raise RuntimeError("canonical_artifact_upload_failed")
            uri = f"gs://{GCS_BUCKET_NAME}/{blob}"
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError("canonical_artifact_upload_failed") from exc
    return CanonicalArtifact(
        project_id=project_id, doc_id=doc_id, file_name=file_name, source_kind=source_kind,
        version_id=version_id, content_sha256=content_hash, canonical_sha256=canonical_hash,
        uri=uri, local_path=str(out_path),
        canonicalization_ms=round((time.perf_counter() - started) * 1000, 3),
        segments=tuple(with_ids),
    )


def read_canonical_artifact(uri: str, *, project_id: str = "", version_id: str = "") -> List[CanonicalSegment]:
    path: Path
    if str(uri).startswith("gs://"):
        blob = _gcs_blob_name(uri)
        path = CANONICAL_ROOT / _safe(project_id) / _safe(version_id) / "canonical-text.jsonl.gz"
        if not path.exists():
            from .gcs_storage import download_file
            path.parent.mkdir(parents=True, exist_ok=True)
            if not download_file(blob, str(path)):
                raise FileNotFoundError("canonical_artifact_unavailable")
    else:
        path = Path(uri)
    result: List[CanonicalSegment] = []
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            value = json.loads(line)
            result.append(CanonicalSegment(
                ordinal=int(value["ordinal"]), locator_type=str(value["locator_type"]),
                locator=dict(value["locator"]), text=str(value["text"]),
                overlapping=bool(value.get("overlapping")), segment_id=str(value["segment_id"]),
                text_sha256=str(value["text_sha256"]),
            ))
    return result


def purge_canonical_artifact(uri: str) -> None:
    version_hint = ""
    if str(uri).startswith("gs://"):
        blob = _gcs_blob_name(uri)
        parts = blob.split("/")
        if len(parts) >= 3:
            version_hint = parts[-2]
        try:
            from .gcs_storage import delete_blob
            delete_blob(blob)
        except Exception:
            pass
    for path in CANONICAL_ROOT.rglob("canonical-text.jsonl.gz") if CANONICAL_ROOT.exists() else []:
        try:
            if (version_hint and path.parent.name == version_hint) or str(path) == str(uri):
                path.unlink(missing_ok=True)
        except Exception:
            pass


__all__ = [
    "CanonicalArtifact", "CanonicalSegment", "purge_canonical_artifact",
    "read_canonical_artifact", "segments_from_data_file", "segments_from_legacy_chunks",
    "segments_from_email", "segments_from_pages", "write_canonical_artifact",
]

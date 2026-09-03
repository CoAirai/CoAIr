"""
Object storage for Parquet, uploads, and catalogs.

Uses Amazon S3 when S3_BUCKET_NAME is set, otherwise Google Cloud Storage when
GCS_BUCKET_NAME is set. Disabled (local disk only) if neither is configured.
"""
import os
from pathlib import Path
from typing import List, Optional

from .logger import logger
from .config import BASE_DIR

# S3 takes precedence when both are set.
S3_BUCKET_NAME = (
    os.getenv("S3_BUCKET_NAME") or os.getenv("AWS_S3_BUCKET") or ""
).strip()
AWS_REGION = (
    os.getenv("AWS_REGION")
    or os.getenv("AWS_DEFAULT_REGION")
    or "me-central-1"
).strip()
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")

# Local paths (must match catalog.py)
PARQUET_DIR = BASE_DIR / "storage" / "parquet"
CATALOG_FILE = PARQUET_DIR / "catalog.json"
# Chunk store (lexical retrieval source — must match chunk_store.py)
CHUNKS_DB_FILE = BASE_DIR / "storage" / "chunks" / "chunks.db"
# Feedback store (data flywheel — must match feedback_store.py)
FEEDBACK_FILE = BASE_DIR / "storage" / "feedback" / "feedback.jsonl"

# GCS prefixes
_PARQUET_PREFIX = "tables/"
_CATALOG_BLOB = "catalog/catalog.json"
_CHUNKS_BLOB = "chunks/chunks.db"
_FEEDBACK_BLOB = "feedback/feedback.jsonl"


def _s3_credentials_present() -> bool:
    return bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"))


def is_enabled() -> bool:
    """Object storage is on when S3 has keys, or GCS bucket is set."""
    if S3_BUCKET_NAME and _s3_credentials_present():
        return True
    return bool(GCS_BUCKET_NAME)


def backend_name() -> str:
    if S3_BUCKET_NAME and _s3_credentials_present():
        return "S3"
    if GCS_BUCKET_NAME:
        return "GCS"
    return "local"


def _tag() -> str:
    return backend_name()


def object_uri(blob_name: str) -> str:
    if S3_BUCKET_NAME:
        return f"s3://{S3_BUCKET_NAME}/{blob_name}"
    if GCS_BUCKET_NAME:
        return f"gs://{GCS_BUCKET_NAME}/{blob_name}"
    return blob_name


def _get_s3():
    import boto3

    return boto3.client("s3", region_name=AWS_REGION)


def _get_bucket():
    """Get GCS bucket client. Returns None if not available."""
    if S3_BUCKET_NAME or not GCS_BUCKET_NAME:
        return None
    try:
        from google.cloud import storage
        client = storage.Client()
        return client.bucket(GCS_BUCKET_NAME)
    except Exception as e:
        logger.warning(f"[GCS] Cannot connect to bucket: {e}")
        return None


def upload_file(local_path: str, blob_name: str) -> bool:
    """Upload a local file to S3 or GCS."""
    if S3_BUCKET_NAME:
        try:
            _get_s3().upload_file(local_path, S3_BUCKET_NAME, blob_name)
            logger.info(f"[S3] Uploaded: {blob_name}")
            return True
        except Exception as e:
            logger.warning(f"[S3] Upload failed for {blob_name}: {e}")
            return False
    bucket = _get_bucket()
    if not bucket:
        return False
    try:
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(local_path)
        logger.info(f"[GCS] Uploaded: {blob_name}")
        return True
    except Exception as e:
        logger.warning(f"[GCS] Upload failed for {blob_name}: {e}")
        return False


def download_file(blob_name: str, local_path: str) -> bool:
    """Download a file from S3 or GCS to local path."""
    if S3_BUCKET_NAME:
        try:
            client = _get_s3()
            client.head_object(Bucket=S3_BUCKET_NAME, Key=blob_name)
            Path(local_path).parent.mkdir(parents=True, exist_ok=True)
            client.download_file(S3_BUCKET_NAME, blob_name, local_path)
            logger.info(f"[S3] Downloaded: {blob_name}")
            return True
        except Exception as e:
            error = getattr(e, "response", None) or {}
            code = str((error.get("Error") or {}).get("Code", ""))
            status = (error.get("ResponseMetadata") or {}).get("HTTPStatusCode")
            if code in {"404", "NoSuchKey", "NotFound"} or status == 404:
                return False
            logger.warning(f"[S3] Download failed for {blob_name}: {e}")
            return False
    bucket = _get_bucket()
    if not bucket:
        return False
    try:
        blob = bucket.blob(blob_name)
        if not blob.exists():
            return False
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(local_path)
        logger.info(f"[GCS] Downloaded: {blob_name}")
        return True
    except Exception as e:
        logger.warning(f"[GCS] Download failed for {blob_name}: {e}")
        return False


def list_blobs(prefix: str) -> List[str]:
    """List object names under a prefix."""
    if S3_BUCKET_NAME:
        try:
            names: List[str] = []
            paginator = _get_s3().get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=S3_BUCKET_NAME, Prefix=prefix):
                for obj in page.get("Contents") or []:
                    key = obj.get("Key")
                    if key:
                        names.append(key)
            return names
        except Exception as e:
            logger.warning(f"[S3] List failed for {prefix}: {e}")
            return []
    bucket = _get_bucket()
    if not bucket:
        return []
    try:
        return [b.name for b in bucket.list_blobs(prefix=prefix)]
    except Exception as e:
        logger.warning(f"[GCS] List failed for {prefix}: {e}")
        return []


def delete_blob(blob_name: str) -> bool:
    """Delete a single object from S3 or GCS."""
    if S3_BUCKET_NAME:
        try:
            _get_s3().delete_object(Bucket=S3_BUCKET_NAME, Key=blob_name)
            logger.info(f"[S3] Deleted: {blob_name}")
            return True
        except Exception as e:
            logger.warning(f"[S3] Delete failed for {blob_name}: {e}")
            return False
    bucket = _get_bucket()
    if not bucket:
        return False
    try:
        blob = bucket.blob(blob_name)
        blob.delete()
        logger.info(f"[GCS] Deleted: {blob_name}")
        return True
    except Exception as e:
        logger.warning(f"[GCS] Delete failed for {blob_name}: {e}")
        return False


# ── High-level sync functions ────────────────────────────────


def sync_catalog_to_gcs():
    """Upload catalog.json to GCS."""
    if not is_enabled() or not CATALOG_FILE.exists():
        return
    upload_file(str(CATALOG_FILE), _CATALOG_BLOB)


def sync_catalog_from_gcs():
    """Always download catalog.json from GCS (Cloud Run is stateless)."""
    if not is_enabled():
        return
    PARQUET_DIR.mkdir(parents=True, exist_ok=True)
    download_file(_CATALOG_BLOB, str(CATALOG_FILE))


def sync_chunks_to_gcs():
    """Upload the chunk store DB to GCS (lexical retrieval source)."""
    if not is_enabled() or not CHUNKS_DB_FILE.exists():
        return
    upload_file(str(CHUNKS_DB_FILE), _CHUNKS_BLOB)


def sync_chunks_from_gcs():
    """Always download the chunk store DB from GCS (Cloud Run is stateless)."""
    if not is_enabled():
        return
    CHUNKS_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    download_file(_CHUNKS_BLOB, str(CHUNKS_DB_FILE))


def sync_feedback_to_gcs():
    """Upload the feedback log to GCS (data flywheel input)."""
    if not is_enabled() or not FEEDBACK_FILE.exists():
        return
    upload_file(str(FEEDBACK_FILE), _FEEDBACK_BLOB)


def sync_feedback_from_gcs():
    """Always download the feedback log from GCS (Cloud Run is stateless)."""
    if not is_enabled():
        return
    FEEDBACK_FILE.parent.mkdir(parents=True, exist_ok=True)
    download_file(_FEEDBACK_BLOB, str(FEEDBACK_FILE))


def sync_parquet_to_gcs(parquet_path: str):
    """Upload a single parquet file to GCS."""
    if not is_enabled():
        return
    name = Path(parquet_path).name
    upload_file(parquet_path, f"{_PARQUET_PREFIX}{name}")


def sync_all_parquets_from_gcs():
    """Always download all parquet files from GCS (Cloud Run is stateless)."""
    if not is_enabled():
        return
    PARQUET_DIR.mkdir(parents=True, exist_ok=True)
    blobs = list_blobs(_PARQUET_PREFIX)
    count = 0
    for blob_name in blobs:
        filename = blob_name.replace(_PARQUET_PREFIX, "")
        if not filename or not filename.endswith(".parquet"):
            continue
        local_path = PARQUET_DIR / filename
        if download_file(blob_name, str(local_path)):
            count += 1
    if count > 0:
        logger.info(f"[{_tag()}] Downloaded {count} parquet files")


# ── Conversation sync ─────────────────────────────────────

_CONVERSATIONS_PREFIX = "conversations/"


def sync_user_conversations_to_gcs(username: str):
    """Upload all conversation JSON files for a user to GCS."""
    if not is_enabled():
        return
    from .config import CONVERSATIONS_DIR
    user_dir = CONVERSATIONS_DIR / username
    if not user_dir.exists():
        return
    count = 0
    for json_file in user_dir.glob("*.json"):
        blob_name = f"{_CONVERSATIONS_PREFIX}{username}/{json_file.name}"
        if upload_file(str(json_file), blob_name):
            count += 1
    if count > 0:
        logger.info(f"[{_tag()}] Uploaded {count} conversation files for {username}")


def sync_user_conversations_from_gcs(username: str):
    """Download conversation JSON files for a user from GCS (if local missing)."""
    if not is_enabled():
        return
    from .config import CONVERSATIONS_DIR
    user_dir = CONVERSATIONS_DIR / username
    user_dir.mkdir(parents=True, exist_ok=True)
    prefix = f"{_CONVERSATIONS_PREFIX}{username}/"
    blobs = list_blobs(prefix)
    count = 0
    for blob_name in blobs:
        filename = blob_name.replace(prefix, "")
        if not filename or not filename.endswith(".json"):
            continue
        local_path = user_dir / filename
        if not local_path.exists():
            if download_file(blob_name, str(local_path)):
                count += 1
    if count > 0:
        logger.info(f"[{_tag()}] Downloaded {count} conversation files for {username}")


# ── Converter registry sync ──────────────────────────────

_CONVERTER_REGISTRY_BLOB = "converters/registry.json"


def sync_converter_registry_to_gcs():
    """Upload converter registry.json to GCS."""
    if not is_enabled():
        return
    from .config import CONVERTER_REGISTRY_FILE
    if CONVERTER_REGISTRY_FILE.exists():
        upload_file(str(CONVERTER_REGISTRY_FILE), _CONVERTER_REGISTRY_BLOB)


def sync_converter_registry_from_gcs():
    """Download converter registry.json from GCS if local is missing."""
    if not is_enabled():
        return
    from .config import CONVERTER_REGISTRY_FILE
    if not CONVERTER_REGISTRY_FILE.exists():
        CONVERTER_REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
        download_file(_CONVERTER_REGISTRY_BLOB, str(CONVERTER_REGISTRY_FILE))


# ── Review session sync ──────────────────────────────────

_REVIEW_SESSIONS_PREFIX = "review_sessions/"


def sync_review_session_to_gcs(session_id: str):
    """Upload a single review session JSON to GCS."""
    if not is_enabled():
        return
    from .config import REVIEW_SESSIONS_DIR
    local_path = REVIEW_SESSIONS_DIR / f"{session_id}.json"
    if local_path.exists():
        upload_file(str(local_path), f"{_REVIEW_SESSIONS_PREFIX}{session_id}.json")


def sync_review_sessions_from_gcs():
    """Download all review session JSON files from GCS (if local missing)."""
    if not is_enabled():
        return
    from .config import REVIEW_SESSIONS_DIR
    REVIEW_SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    blobs = list_blobs(_REVIEW_SESSIONS_PREFIX)
    count = 0
    for blob_name in blobs:
        filename = blob_name.replace(_REVIEW_SESSIONS_PREFIX, "")
        if not filename or not filename.endswith(".json"):
            continue
        local_path = REVIEW_SESSIONS_DIR / filename
        if not local_path.exists():
            if download_file(blob_name, str(local_path)):
                count += 1
    if count > 0:
        logger.info(f"[{_tag()}] Downloaded {count} review session files")


# ── Document registry sync ──────────────────────────────

_DOCUMENT_REGISTRY_BLOB = "registry/document_registry.json"


def sync_document_registry_to_gcs():
    """Upload document_registry.json to GCS."""
    if not is_enabled():
        return
    from .config import STORAGE_DIR
    registry_file = STORAGE_DIR / "document_registry.json"
    if registry_file.exists():
        upload_file(str(registry_file), _DOCUMENT_REGISTRY_BLOB)


def sync_document_registry_from_gcs():
    """Always download document_registry.json from GCS (Cloud Run is stateless)."""
    if not is_enabled():
        return
    from .config import STORAGE_DIR
    registry_file = STORAGE_DIR / "document_registry.json"
    registry_file.parent.mkdir(parents=True, exist_ok=True)
    download_file(_DOCUMENT_REGISTRY_BLOB, str(registry_file))


# ── Uploaded source files sync ──────────────────────────

_UPLOADS_PREFIX = "uploads/"


def sync_uploaded_file_to_gcs(file_path: str):
    """Upload a single source file (email/doc/table) to GCS after upload."""
    if not is_enabled():
        return
    p = Path(file_path)
    from .config import DATA_DIR
    try:
        rel = p.relative_to(DATA_DIR)
        upload_file(file_path, f"{_UPLOADS_PREFIX}{rel.as_posix()}")
    except ValueError:
        pass


def sync_all_uploads_from_gcs():
    """Always download all uploaded source files from GCS (Cloud Run is stateless)."""
    if not is_enabled():
        return
    from .config import DATA_DIR
    blobs = list_blobs(_UPLOADS_PREFIX)
    count = 0
    for blob_name in blobs:
        rel = blob_name.replace(_UPLOADS_PREFIX, "")
        if not rel:
            continue
        local_path = DATA_DIR / rel
        if download_file(blob_name, str(local_path)):
            count += 1
    if count > 0:
        logger.info(f"[{_tag()}] Downloaded {count} uploaded source files")


def delete_uploaded_file_from_gcs(file_path: str):
    """Delete a source file from GCS when user deletes it."""
    if not is_enabled():
        return
    p = Path(file_path)
    from .config import DATA_DIR
    try:
        rel = p.relative_to(DATA_DIR)
        delete_blob(f"{_UPLOADS_PREFIX}{rel.as_posix()}")
    except ValueError:
        pass


def clear_gcs_tables():
    """Delete all table data from object storage (parquets + catalog)."""
    if not is_enabled():
        return
    try:
        count = 0
        if S3_BUCKET_NAME:
            for name in list_blobs(_PARQUET_PREFIX):
                if delete_blob(name):
                    count += 1
        else:
            bucket = _get_bucket()
            if not bucket:
                return
            for blob in bucket.list_blobs(prefix=_PARQUET_PREFIX):
                blob.delete()
                count += 1
        delete_blob(_CATALOG_BLOB)
        logger.info(f"[Storage] Cleared {count} parquets + catalog")
    except Exception as e:
        logger.warning(f"[Storage] Clear failed: {e}")

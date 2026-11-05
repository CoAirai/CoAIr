"""Private Azure Blob objects; application authorization stays in the API.

Activated only by OBJECT_STORAGE_BACKEND=azure. No container creation, public
URLs, account keys, browser SAS, or source-provider fallback occurs here.
"""
from functools import lru_cache
import hashlib
import mimetypes
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit


def settings():
    url = os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip().rstrip("/")
    container = os.getenv("AZURE_STORAGE_CONTAINER", "").strip()
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.username or parsed.password or
            parsed.query or parsed.fragment or parsed.path or
            not re.fullmatch(r"[a-z0-9]{3,24}\.blob\.core\.windows\.net", parsed.netloc)):
        raise ValueError("azure_storage_account_url_invalid")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9]|-(?!-)){1,61}[a-z0-9]", container):
        raise ValueError("azure_storage_container_invalid")
    return url, container


def validate_key(key):
    if (not isinstance(key, str) or not key or key.startswith("/") or
            "\\" in key or any(part in ("", ".", "..") for part in key.split("/")) or
            any(ord(c) < 32 for c in key)):
        raise ValueError("azure_blob_key_invalid")
    return key


@lru_cache(maxsize=1)
def container_client():
    from azure.identity import DefaultAzureCredential
    from azure.storage.blob import BlobServiceClient
    url, container = settings()
    credential = DefaultAzureCredential(
        managed_identity_client_id=os.getenv("AZURE_CLIENT_ID") or None,
        exclude_interactive_browser_credential=True,
    )
    return BlobServiceClient(
        account_url=url, credential=credential, connection_timeout=10, read_timeout=60,
        max_single_put_size=8 * 1024 * 1024, max_block_size=4 * 1024 * 1024,
        max_single_get_size=4 * 1024 * 1024, max_chunk_get_size=4 * 1024 * 1024,
    ).get_container_client(container)


def object_uri(key):
    url, container = settings()
    account = urlsplit(url).hostname.split(".")[0]
    return f"az://{account}/{container}/{validate_key(key)}"


def key_from_uri(uri):
    """Resolve only this account/container or an explicitly mapped legacy bucket."""
    if uri.startswith("az://"):
        url, container = settings()
        expected = f"az://{urlsplit(url).hostname.split('.')[0]}/{container}/"
        if not uri.startswith(expected):
            raise ValueError("azure_artifact_location_mismatch")
        return validate_key(uri[len(expected):])
    if uri.startswith(("s3://", "gs://")):
        scheme, rest = uri.split("://", 1)
        bucket, separator, key = rest.partition("/")
        variable = "AZURE_MIGRATION_SOURCE_S3_BUCKET" if scheme == "s3" else "AZURE_MIGRATION_SOURCE_GCS_BUCKET"
        if not separator or not bucket or bucket != os.getenv(variable, "").strip():
            raise ValueError("azure_legacy_bucket_not_mapped")
        return validate_key(key)
    raise ValueError("azure_artifact_uri_invalid")


def file_sha256(path):
    value = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def upload_file(local_path, key):
    from azure.storage.blob import ContentSettings
    blob = container_client().get_blob_client(validate_key(key))
    with open(local_path, "rb") as handle:
        blob.upload_blob(
            handle, overwrite=True, max_concurrency=1,
            metadata={"coair_sha256": file_sha256(local_path)},
            content_settings=ContentSettings(content_type=mimetypes.guess_type(key)[0] or "application/octet-stream"),
        )
    return True


def download_file(key, local_path):
    """Download atomically at one ETag; never trust equal length as integrity."""
    from azure.core import MatchConditions
    from azure.core.exceptions import ResourceNotFoundError
    blob = container_client().get_blob_client(validate_key(key))
    try:
        properties = blob.get_blob_properties()
    except ResourceNotFoundError:
        return False
    path = Path(local_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    expected_hash = (properties.metadata or {}).get("coair_sha256")
    if expected_hash and path.is_file() and file_sha256(path) == expected_hash:
        return True
    fd, temporary = tempfile.mkstemp(prefix=".blob-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            blob.download_blob(etag=properties.etag, match_condition=MatchConditions.IfNotModified,
                               max_concurrency=1).readinto(handle)
        if Path(temporary).stat().st_size != properties.size:
            raise ValueError("azure_blob_size_mismatch")
        if expected_hash and file_sha256(temporary) != expected_hash:
            raise ValueError("azure_blob_hash_mismatch")
        os.replace(temporary, path)
        return True
    finally:
        Path(temporary).unlink(missing_ok=True)


def list_blobs(prefix):
    validate_key(prefix.rstrip("/"))
    return [row.name for row in container_client().list_blobs(name_starts_with=prefix)]


def delete_blob(key):
    from azure.core.exceptions import ResourceNotFoundError
    try:
        container_client().delete_blob(validate_key(key))
    except ResourceNotFoundError:
        pass
    return True


def object_size(key):
    from azure.core.exceptions import ResourceNotFoundError
    try:
        return container_client().get_blob_client(validate_key(key)).get_blob_properties().size
    except ResourceNotFoundError:
        return None

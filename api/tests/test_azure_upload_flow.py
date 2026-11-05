"""Azure storage preserves project ownership, upload accounting and citations."""
import asyncio
import gzip
import io
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import UploadFile


@pytest.mark.parametrize("stored", [True, False])
def test_blob_persistence_precedes_registration_and_accounting(tmp_path, monkeypatch, stored):
    from backend.services.file_service import FileService
    from src import gcs_storage, document_registry, billing_store, tenant_paths

    events = []
    registry = SimpleNamespace(find_duplicate=Mock(return_value=None),
                               register=Mock(side_effect=lambda *a, **kw: events.append("registry")))
    billing = SimpleNamespace(register_storage=Mock(side_effect=lambda **kw: events.append("billing")),
                              release_storage=Mock())
    monkeypatch.setattr(document_registry, "get_document_registry", lambda: registry)
    monkeypatch.setattr(billing_store, "get_billing_store", lambda: billing)
    monkeypatch.setattr(gcs_storage, "backend_name", lambda: "Azure")
    monkeypatch.setattr(gcs_storage, "upload_file", lambda *a: events.append("blob") or stored)
    background_sync = Mock()
    monkeypatch.setattr(gcs_storage, "enqueue_object_sync", background_sync)
    monkeypatch.setattr(tenant_paths, "s3_upload_key_for_local", lambda path: "uploads/companies/c/p/documents/scan.pdf")
    service = FileService()
    monkeypatch.setattr(service, "_target_dir", lambda *a: tmp_path)
    upload = UploadFile(filename="scan.pdf", file=io.BytesIO(b"%PDF-1.7\nfixture"))
    if stored:
        path, doc_id, duplicate = asyncio.run(service.save(upload, "project-a", "fixture-user"))
        assert events == ["blob", "billing", "registry"]
        assert Path(path).exists() and doc_id and not duplicate
        assert registry.register.call_args.kwargs["project_id"] == "project-a"
        assert billing.register_storage.call_args.kwargs["project_id"] == "project-a"
        background_sync.assert_not_called()
    else:
        with pytest.raises(ValueError, match="storage_upload_failed"):
            asyncio.run(service.save(upload, "project-a", "fixture-user"))
        assert events == ["blob"]
        assert not list(tmp_path.iterdir())
        registry.register.assert_not_called()
        billing.register_storage.assert_not_called()


def test_private_blob_upload_plan_uses_existing_authenticated_proxy(monkeypatch):
    from backend.api import files
    from src import gcs_storage, ingestion_billing
    monkeypatch.setattr(gcs_storage, "supports_browser_put", lambda: False)
    monkeypatch.setattr(ingestion_billing, "enforce_uploader_budget", lambda username: None)
    presign = Mock(side_effect=AssertionError("No SAS should be issued"))
    monkeypatch.setattr(gcs_storage, "presign_browser_put", presign)
    plan = asyncio.run(files.prepare_direct_upload(
        files.DirectUploadBody(filename="scan.pdf", size_bytes=1024),
        SimpleNamespace(username="fixture-user"), SimpleNamespace(project_id="project-a")))
    assert plan.mode == "proxy" and not plan.upload_url
    presign.assert_not_called()


def test_cold_citation_source_downloads_from_blob_after_project_membership(tmp_path, monkeypatch):
    from backend.services.document_service import DocumentService
    from src import gcs_storage, tenant_paths
    destination = tmp_path / "data/companies/c/p/documents/scan.pdf"
    monkeypatch.setattr(gcs_storage, "is_enabled", lambda: True)
    monkeypatch.setattr(tenant_paths, "s3_upload_key_for_local", lambda path: "uploads/companies/c/p/documents/scan.pdf")
    calls = []

    def download(key, path):
        calls.append(key)
        Path(path).write_bytes(b"%PDF-1.7\nfixture")
        return True

    monkeypatch.setattr(gcs_storage, "download_file", download)
    assert not destination.exists()
    assert DocumentService._download_from_cloud(destination) == str(destination.resolve())
    assert calls == ["uploads/companies/c/p/documents/scan.pdf"]


@pytest.mark.parametrize("uri", [
    "az://coairfixture/documents/canonical-events/project-a/version/canonical-text.jsonl.gz",
    "s3://old-bucket/canonical-events/project-a/version/canonical-text.jsonl.gz",
])
def test_cold_canonical_reference_preserves_legacy_and_azure_uris(tmp_path, monkeypatch, uri):
    from src import canonical_artifacts, gcs_storage
    monkeypatch.setattr(canonical_artifacts, "CANONICAL_ROOT", tmp_path)
    monkeypatch.setattr(gcs_storage, "OBJECT_STORAGE_BACKEND", "azure")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://coairfixture.blob.core.windows.net")
    monkeypatch.setenv("AZURE_STORAGE_CONTAINER", "documents")
    monkeypatch.setenv("AZURE_MIGRATION_SOURCE_S3_BUCKET", "old-bucket")

    def download(key, path):
        assert key == "canonical-events/project-a/version/canonical-text.jsonl.gz"
        with gzip.open(path, "wt") as handle:
            handle.write(json.dumps({"ordinal": 0, "locator_type": "page", "locator": {"page": 2},
                                     "text": "Original evidence", "segment_id": "existing-id", "text_sha256": "existing-hash"}) + "\n")
        return True

    monkeypatch.setattr(gcs_storage, "download_file", download)
    rows = canonical_artifacts.read_canonical_artifact(uri, project_id="project-a", version_id="version")
    assert rows[0].segment_id == "existing-id" and rows[0].locator == {"page": 2}
    assert rows[0].text == "Original evidence"

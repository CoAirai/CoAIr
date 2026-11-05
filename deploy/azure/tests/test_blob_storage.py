import hashlib
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from _support import ROOT, load

store = load("azure_storage_test", ROOT / "api/src/azure_blob_storage.py")


class BlobStorageTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict("os.environ", {
            "AZURE_STORAGE_ACCOUNT_URL": "https://coairfixture.blob.core.windows.net",
            "AZURE_STORAGE_CONTAINER": "documents",
        }, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_private_uri_has_no_signature_and_validates_destination(self):
        uri = store.object_uri("canonical-events/project-a/version/canonical-text.jsonl.gz")
        self.assertEqual(store.key_from_uri(uri), "canonical-events/project-a/version/canonical-text.jsonl.gz")
        for value in [uri.replace("coairfixture", "otheraccount"), uri.replace("/documents/", "/other/")]:
            with self.assertRaises(ValueError):
                store.key_from_uri(value)

    def test_legacy_uri_requires_explicit_bucket_mapping(self):
        with self.assertRaises(ValueError):
            store.key_from_uri("s3://old-bucket/canonical-events/project-a/v/text.gz")
        with patch.dict("os.environ", {"AZURE_MIGRATION_SOURCE_S3_BUCKET": "old-bucket"}):
            self.assertEqual(store.key_from_uri("s3://old-bucket/canonical-events/project-a/v/text.gz"),
                             "canonical-events/project-a/v/text.gz")
            with self.assertRaises(ValueError):
                store.key_from_uri("s3://unmapped-bucket/canonical-events/project-a/v/text.gz")

    def test_rejects_account_secrets_non_tls_and_invalid_containers(self):
        for url in ["http://coairfixture.blob.core.windows.net", "https://user:secret@coairfixture.blob.core.windows.net",
                    "https://coairfixture.blob.core.windows.net?sig=secret", "https://coairfixture.blob.core.windows.net/container"]:
            with patch.dict("os.environ", {"AZURE_STORAGE_ACCOUNT_URL": url}), self.assertRaises(ValueError):
                store.settings()
        for name in ["ab", "private--docs", "UPPER", "../docs"]:
            with patch.dict("os.environ", {"AZURE_STORAGE_CONTAINER": name}), self.assertRaises(ValueError):
                store.settings()

    def test_rejects_object_traversal(self):
        for key in ["../file", "/file", "uploads/../file", "uploads//file", "uploads\\file", "uploads/\nfile"]:
            with self.assertRaises(ValueError):
                store.validate_key(key)

    def _blob(self, payload, *, metadata=None, size=None):
        blob = MagicMock()
        blob.get_blob_properties.return_value = SimpleNamespace(
            size=len(payload) if size is None else size, metadata=metadata or {}, etag="one-version")
        blob.download_blob.return_value.readinto.side_effect = lambda handle: handle.write(payload)
        blob.download_blob.return_value.chunks.return_value = iter([payload])
        return blob

    def test_download_replaces_same_length_stale_content(self):
        payload = b"new-content"
        blob = self._blob(payload)
        with tempfile.TemporaryDirectory() as root, patch.object(store, "container_client") as client:
            path = Path(root) / "source.pdf"
            path.write_bytes(b"old-content")
            client.return_value.get_blob_client.return_value = blob
            self.assertTrue(store.download_file("uploads/project-a/source.pdf", path))
            self.assertEqual(path.read_bytes(), payload)
            self.assertEqual(blob.download_blob.call_args.kwargs["etag"], "one-version")
            self.assertEqual(list(Path(root).glob(".blob-*")), [])

    def test_failed_hash_does_not_replace_valid_local_content(self):
        blob = self._blob(b"bad", metadata={"coair_sha256": hashlib.sha256(b"expected").hexdigest()})
        with tempfile.TemporaryDirectory() as root, patch.object(store, "container_client") as client:
            path = Path(root) / "source.pdf"
            path.write_bytes(b"previous")
            client.return_value.get_blob_client.return_value = blob
            with self.assertRaises(ValueError):
                store.download_file("uploads/project-a/source.pdf", path)
            self.assertEqual(path.read_bytes(), b"previous")
            self.assertEqual(list(Path(root).glob(".blob-*")), [])

    def test_stream_failure_never_leaves_partial_source(self):
        blob = self._blob(b"partial")
        blob.download_blob.return_value.readinto.side_effect = RuntimeError("interrupted")
        with tempfile.TemporaryDirectory() as root, patch.object(store, "container_client") as client:
            path = Path(root) / "source.pdf"
            client.return_value.get_blob_client.return_value = blob
            with self.assertRaises(RuntimeError):
                store.download_file("uploads/project-a/source.pdf", path)
            self.assertFalse(path.exists())
            self.assertEqual(list(Path(root).iterdir()), [])

    def test_upload_sets_sha_and_streams_with_bounded_concurrency(self):
        with tempfile.TemporaryDirectory() as root, patch.object(store, "container_client") as client:
            path = Path(root) / "scan.pdf"
            path.write_bytes(b"sample")
            store.upload_file(path, "uploads/project-a/scan.pdf")
            kwargs = client.return_value.get_blob_client.return_value.upload_blob.call_args.kwargs
            self.assertEqual(kwargs["metadata"]["coair_sha256"], hashlib.sha256(b"sample").hexdigest())
            self.assertEqual(kwargs["max_concurrency"], 1)
            self.assertEqual(kwargs["content_settings"].content_type, "application/pdf")

    def test_absent_source_is_not_successful(self):
        from azure.core.exceptions import ResourceNotFoundError
        with patch.object(store, "container_client") as client, tempfile.TemporaryDirectory() as root:
            client.return_value.get_blob_client.return_value.get_blob_properties.side_effect = ResourceNotFoundError()
            self.assertFalse(store.download_file("uploads/project-a/missing.pdf", Path(root) / "missing.pdf"))

    def test_explicit_azure_never_falls_back_to_s3_or_browser_sas(self):
        package = ModuleType("storage_fixture"); package.__path__ = []
        logger = ModuleType("storage_fixture.logger"); logger.logger = MagicMock()
        config = ModuleType("storage_fixture.config"); config.BASE_DIR = Path("/not-used")
        modules = {"storage_fixture": package, "storage_fixture.logger": logger,
                   "storage_fixture.config": config, "storage_fixture.azure_blob_storage": store}
        with patch.dict(sys.modules, modules), patch.dict("os.environ", {
            "OBJECT_STORAGE_BACKEND": "azure", "S3_BUCKET_NAME": "old-bucket",
            "AWS_ACCESS_KEY_ID": "fixture", "AWS_SECRET_ACCESS_KEY": "fixture",
        }):
            facade = load("storage_fixture.gcs_storage", ROOT / "api/src/gcs_storage.py")
            self.assertTrue(facade.is_enabled())
            self.assertEqual(facade.backend_name(), "Azure")
            self.assertFalse(facade.supports_browser_put())
            with patch.object(store, "upload_file", return_value=True) as upload, patch.object(facade, "_get_s3") as s3:
                self.assertTrue(facade.upload_file("local.pdf", "uploads/a/local.pdf"))
                upload.assert_called_once()
                s3.assert_not_called()
            with self.assertRaises(RuntimeError):
                facade.presign_browser_put("uploads/a/local.pdf", "application/pdf")

from pathlib import Path
import sys
import tempfile
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

from _support import ROOT, load

runtime = load("runtime_check_fixture", ROOT / "deploy/azure/runtime_check.py")
adapter = load("runtime_check_adapter", ROOT / "api/src/azure_blob_storage.py")


class RuntimeCheckTests(unittest.TestCase):
    def test_blob_probe_ocrs_the_cold_download_and_deletes_only_its_own_object(self):
        package = ModuleType("src"); package.__path__ = []
        objects = {}
        store = ModuleType("src.azure_blob_storage")
        store.upload_file = lambda path, key: objects.update({key: Path(path).read_bytes()})

        def download(key, path):
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            Path(path).write_bytes(objects[key])
            return True

        store.download_file = download
        store.file_sha256 = adapter.file_sha256
        store.delete_blob = Mock(side_effect=lambda key: objects.pop(key))
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules, {"src": package, "src.azure_blob_storage": store}):
            directory = Path(root)
            original = directory / "scan.pdf"
            original.write_bytes(b"fixture-scan")
            with patch.object(runtime, "ocr_check", return_value=({"ok": True}, None)) as ocr:
                report = runtime.blob_check(directory, original)
                self.assertTrue(report["ocr_on_downloaded_scan"]["ok"])
                ocr.assert_called_once_with(directory, pdf=directory / "cold-download/scan.pdf")
            self.assertFalse(objects)
            key = store.delete_blob.call_args.args[0]
            self.assertTrue(key.startswith("migration-probes/"))
            self.assertEqual(original.read_bytes(), b"fixture-scan")

    def test_corrupt_probe_fails_and_still_cleans_up(self):
        package = ModuleType("src"); package.__path__ = []
        store = ModuleType("src.azure_blob_storage")
        store.upload_file = Mock()
        store.download_file = Mock(return_value=False)
        store.delete_blob = Mock()
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules, {"src": package, "src.azure_blob_storage": store}):
            path = Path(root) / "probe.txt"
            path.write_text("fixture")
            with self.assertRaises(ValueError):
                runtime.blob_check(Path(root), path)
            store.delete_blob.assert_called_once_with(store.upload_file.call_args.args[1])

import hashlib
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from _support import ROOT, load

sys.path.insert(0, str(ROOT / "deploy/azure"))
from blob_assets import plan_assets, verify_assets


class BlobAssetTests(unittest.TestCase):
    def inventory(self):
        return {"schema": 1, "files": [
            {"path": path, "kind": kind, "size": 3, **({"sha256": hashlib.sha256(b"abc").hexdigest()} if kind == "asset" else {})}
            for path, kind in [
                ("data/companies/company/project/documents/scan.pdf", "asset"),
                ("storage/canonical_events/project/version/canonical-text.jsonl.gz", "asset"),
                ("storage/parquet/table.parquet", "asset"),
                ("storage/document_registry.json", "asset"),
                ("storage/accounts.db", "mutable_state"),
            ]]}

    def test_mapping_preserves_paths_and_excludes_live_state(self):
        plan = plan_assets(self.inventory())
        self.assertEqual([row["key"] for row in plan["objects"]], [
            "uploads/companies/company/project/documents/scan.pdf",
            "canonical-events/project/version/canonical-text.jsonl.gz", "tables/table.parquet"])
        self.assertEqual(plan["excluded_requires_separate_restore"], ["storage/document_registry.json", "storage/accounts.db"])
        self.assertFalse(plan["migration_accepted"])

    def test_verification_hashes_remote_bytes_not_size_or_metadata(self):
        module = load("blob_asset_test_adapter", ROOT / "api/src/azure_blob_storage.py")
        package = ModuleType("src"); package.__path__ = []
        with patch.dict(sys.modules, {"src": package, "src.azure_blob_storage": module}):
            for payload, expected in [(b"abc", True), (b"bad", False)]:
                with self.subTest(payload=payload):
                    client = MagicMock()
                    blob = client.get_blob_client.return_value
                    blob.get_blob_properties.return_value = SimpleNamespace(size=3, etag="v1")
                    blob.download_blob.return_value.chunks.side_effect = lambda **kwargs: iter([payload])
                    report = verify_assets(plan_assets(self.inventory()), client)
                    self.assertEqual(report["asset_bytes_verified"], expected)
                    self.assertFalse(report["migration_accepted"])

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from _support import ROOT, load
inventory = load('migration_inventory', ROOT / 'deploy/azure/inventory.py')

class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir(); (self.root / 'storage').mkdir()
        (self.root / 'data/source.pdf').write_bytes(b'%PDF original')
        self.registry = self.root / 'storage/document_registry.json'
        self.registry.write_text(json.dumps({'one': {'doc_id': 'one', 'project_id': 'a', 'file_name': 'source.pdf'}}))

    def test_hashes_assets_and_preserves_source_bytes(self):
        result = inventory.inventory(self.root)
        self.assertEqual(inventory.compare(result, result)['asset_inventory_matches'], True)
        self.assertEqual((self.root / 'data/source.pdf').read_bytes(), b'%PDF original')
        self.assertFalse(result['consistent_state_backup_verified'])

    def test_detects_changed_missing_and_extra_files(self):
        before = inventory.inventory(self.root)
        (self.root / 'data/source.pdf').unlink()
        (self.root / 'data/new.pdf').write_bytes(b'new')
        result = inventory.compare(before, inventory.inventory(self.root))
        self.assertEqual(result['missing'], ['data/source.pdf'])
        self.assertEqual(result['extra'], ['data/new.pdf'])
        self.assertFalse(result['asset_inventory_matches'])

    def test_detects_changed_content_even_when_size_is_identical(self):
        before = inventory.inventory(self.root)
        path = self.root / 'data/source.pdf'; path.write_bytes(b'x' * path.stat().st_size)
        self.assertIn('data/source.pdf', inventory.compare(before, inventory.inventory(self.root))['changed'])

    def test_document_or_project_reassignment_is_not_accepted(self):
        before = inventory.inventory(self.root)
        for field in ('doc_id', 'project_id'):
            with self.subTest(field=field):
                row = {'doc_id': 'one', 'project_id': 'a', 'file_name': 'source.pdf'}
                row[field] = 'other'; self.registry.write_text(json.dumps({'one': row}))
                result = inventory.compare(before, inventory.inventory(self.root))
                self.assertFalse(result['registry_identity_matches'])
                self.assertFalse(result['asset_inventory_matches'])

    def test_live_state_does_not_get_a_false_backup_certificate(self):
        (self.root / 'storage/users.db').write_bytes(b'live database')
        result = inventory.inventory(self.root)
        row = next(x for x in result['files'] if x['path'] == 'storage/users.db')
        self.assertNotIn('sha256', row)
        comparison = inventory.compare(result, result)
        self.assertFalse(comparison['migration_accepted'])
        self.assertIn('storage/users.db', comparison['mutable_state_requires_separate_backup'])

    def test_a_file_changing_during_hashing_aborts_inventory(self):
        path = self.root / 'data/source.pdf'
        real_sha = inventory.hashlib.sha256
        class ChangingHash:
            def __init__(self): self.inner = real_sha()
            def update(self, value):
                self.inner.update(value)
                path.write_bytes(b'changed during read')
            def hexdigest(self): return self.inner.hexdigest()
        with patch.object(inventory.hashlib, 'sha256', ChangingHash):
            with self.assertRaises(ValueError): inventory.digest(path)

    def test_registry_without_project_ids_is_explicit(self):
        self.registry.write_text(json.dumps({'legacy': {'doc_id': 'legacy'}}))
        self.assertEqual(inventory.inventory(self.root)['registry_identity']['without_project_id'], 1)

    def test_secrets_are_not_inventoried(self):
        (self.root / 'storage/.env').write_text('SECRET=private')
        (self.root / 'storage/key.pem').write_text('private')
        (self.root / 'storage/secrets').mkdir()
        (self.root / 'storage/secrets/key.json').write_text('private')
        paths = [x['path'] for x in inventory.inventory(self.root)['files']]
        self.assertFalse(any('secret' in x or '.env' in x or '.pem' in x for x in paths))

    def test_symlink_cannot_escape_root(self):
        (self.root / 'data/link').symlink_to('/etc')
        with self.assertRaises(ValueError): inventory.inventory(self.root)

    def test_untrusted_manifests_cannot_hide_duplicates_or_traversal(self):
        good = inventory.inventory(self.root)
        for name in ('../escape', '/data/source.pdf', 'data/../storage/users.db', 'data\\source.pdf'):
            bad = json.loads(json.dumps(good)); bad['files'][0]['path'] = name
            with self.subTest(name=name), self.assertRaises(ValueError): inventory.compare(good, bad)
        bad = json.loads(json.dumps(good)); bad['files'].append(bad['files'][0])
        with self.assertRaises(ValueError): inventory.compare(good, bad)

    def test_output_has_owner_only_permissions(self):
        target = self.root / 'private.inventory.json'
        inventory.write_report(target, {'schema': 1})
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_empty_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder, self.assertRaises(ValueError): inventory.inventory(folder)



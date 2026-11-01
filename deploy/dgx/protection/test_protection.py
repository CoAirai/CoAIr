import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pack import package, sign
from runtime import unlock, ProtectedModules


class ProtectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'app'
        self.root.mkdir()
        self.secrets = Path(self.temp.name) / 'secrets'
        self.secrets.mkdir()
        for directory in ('src', 'backend', 'vendor', 'scripts', 'config/prompts'):
            (self.root / directory).mkdir(parents=True, exist_ok=True)
        (self.root / 'src/__init__.py').write_text('')
        (self.root / 'src/example.py').write_text('VALUE = 42\n')
        for name in ('chronology_v2.yaml', 'chronology_v3.yaml'):
            (self.root / 'config/prompts' / name).write_text('{"secret": "private prompt"}')
        self.key = os.urandom(32)
        self.signer = Ed25519PrivateKey.generate()
        self.key_path = self.secrets / 'key'
        self.key_path.write_bytes(self.key)
        self.identity = self.secrets / 'identity'
        self.identity.write_text('test-device')
        import hashlib
        self.license = self.secrets / 'license'
        self.license.write_text(json.dumps(sign({'product': 'coair-local-pilot',
            'device': hashlib.sha256(b'test-device').hexdigest(),
            'key_sha256': hashlib.sha256(self.key).hexdigest()}, self.signer)))
        package(self.root, self.key, self.signer, 'test')

    def open(self):
        return unlock(self.root, self.key_path, self.license, self.identity, self.signer.public_key())

    def test_round_trip_has_no_plain_sources_or_prompts(self):
        data, manifest = self.open()
        self.assertEqual(data['sources']['src/example.py'], 'VALUE = 42\n')
        self.assertEqual(manifest['release'], 'test')
        self.assertFalse(list(self.root.rglob('*.py')))
        self.assertFalse(list(self.root.rglob('*.yaml')))
        blob = (self.root / 'protection/application.enc').read_bytes()
        self.assertNotIn(b'private prompt', blob)
        self.assertNotIn(self.key, blob)

    def test_changed_ciphertext_rejected(self):
        p = self.root / 'protection/application.enc'
        raw = bytearray(p.read_bytes()); raw[-1] ^= 1; p.write_bytes(raw)
        with self.assertRaises(ValueError): self.open()

    def test_wrong_key_rejected(self):
        self.key_path.write_bytes(os.urandom(32))
        with self.assertRaises(ValueError): self.open()

    def test_missing_key_rejected(self):
        self.key_path.unlink()
        with self.assertRaises(FileNotFoundError): self.open()

    def test_other_device_rejected(self):
        self.identity.write_text('other-device')
        with self.assertRaises(ValueError): self.open()

    def test_forged_license_rejected(self):
        license_data = json.loads(self.license.read_text())
        license_data['signature'] = 'AA=='
        self.license.write_text(json.dumps(license_data))
        with self.assertRaises(InvalidSignature): self.open()

    def test_forged_manifest_rejected(self):
        p = self.root / 'protection/manifest.json'
        manifest = json.loads(p.read_text()); manifest['signature'] = 'AA=='
        p.write_text(json.dumps(manifest))
        with self.assertRaises(InvalidSignature): self.open()

    def test_authenticated_encryption_rejects_modified_payload_even_if_resigned(self):
        import base64
        import hashlib
        p = self.root / 'protection/application.enc'
        raw = bytearray(p.read_bytes()); raw[-1] ^= 1; p.write_bytes(raw)
        manifest_path = self.root / 'protection/manifest.json'
        envelope = json.loads(manifest_path.read_text())
        manifest = json.loads(base64.b64decode(envelope['payload']))
        manifest['files']['protection/application.enc'] = hashlib.sha256(raw).hexdigest()
        manifest_path.write_text(json.dumps(sign(manifest, self.signer)))
        with self.assertRaises(InvalidTag): self.open()

    def test_module_exec_preserves_virtual_filename(self):
        data, _ = self.open()
        loader = ProtectedModules(self.root, data['sources'])
        spec = loader.find_spec('src.example', [str(self.root / 'src')])
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        self.assertEqual(module.VALUE, 42)
        self.assertEqual(module.__file__, str(self.root.resolve() / 'src/example.py'))


if __name__ == '__main__': unittest.main()

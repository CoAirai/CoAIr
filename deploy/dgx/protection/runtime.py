"""Protected pilot launcher. Compile this module; never distribute this source.

Protects offline artifacts, not a process controlled by a hostile root user.
"""
import base64
import hashlib
import importlib.abc
import importlib.util
import json
import os
from pathlib import Path
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

TRUSTED_PUBLIC_KEY = 'BUILD_REPLACES_THIS'
ROOT = Path('/app')
_ACTIVE = None
AAD = b'coair-protected-pilot-v1'


def signed_payload(envelope, public_key):
    raw = base64.b64decode(envelope['payload'], validate=True)
    public_key.verify(base64.b64decode(envelope['signature'], validate=True), raw)
    return json.loads(raw)


def unlock(root, key_path, license_path, identity_path, public_key):
    manifest = signed_payload(json.loads((root / 'protection/manifest.json').read_text()), public_key)
    if manifest.get('format') != 1:
        raise ValueError('Unsupported protection format')
    for relative, digest in manifest['files'].items():
        path = root / relative
        if path.resolve().is_relative_to(root.resolve()) is False:
            raise ValueError('Invalid artifact path')
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError('Protected artifact integrity check failed')
    license_data = signed_payload(json.loads(license_path.read_text()), public_key)
    identity = identity_path.read_text().strip()
    if not identity or license_data.get('device') != hashlib.sha256(identity.encode()).hexdigest():
        raise ValueError('Device license mismatch')
    key = key_path.read_bytes()
    if len(key) != 32 or hashlib.sha256(key).hexdigest() != license_data.get('key_sha256'):
        raise ValueError('Device key mismatch')
    if license_data.get('product') != 'coair-local-pilot':
        raise ValueError('Product license mismatch')
    blob = (root / 'protection/application.enc').read_bytes()
    data = json.loads(AESGCM(key).decrypt(blob[:12], blob[12:], AAD))
    return data, manifest


class ProtectedModules(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def __init__(self, root, sources):
        self.root = root.resolve()
        self.sources = sources

    def find_spec(self, fullname, path=None, target=None):
        leaf = fullname.rsplit('.', 1)[-1]
        for parent in path if path is not None else sys.path:
            base = Path(parent or os.getcwd()).resolve()
            for candidate, package in ((base / leaf / '__init__.py', True), (base / (leaf + '.py'), False)):
                try:
                    relative = candidate.relative_to(self.root).as_posix()
                except ValueError:
                    continue
                if relative in self.sources:
                    spec = importlib.util.spec_from_file_location(fullname, candidate, loader=self,
                        submodule_search_locations=[str(candidate.parent)] if package else None)
                    spec.loader_state = relative
                    return spec
        return None

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        relative = module.__spec__.loader_state
        # Retain virtual filenames for existing BASE_DIR and vendor path logic.
        exec(compile(self.sources[relative], str(self.root / relative), 'exec'), module.__dict__)


def activate():
    global _ACTIVE
    if _ACTIVE is None:
        public = Ed25519PublicKey.from_public_bytes(bytes.fromhex(TRUSTED_PUBLIC_KEY))
        data, manifest = unlock(ROOT, Path('/run/secrets/coair-protection.key'),
            Path('/run/secrets/coair-license.json'), Path('/run/coair-machine-id'), public)
        sys.meta_path.insert(0, ProtectedModules(ROOT, data['sources']))
        _ACTIVE = (data, manifest)
    return _ACTIVE[1]


def read_resource(relative):
    if _ACTIVE is None:
        raise RuntimeError('Protected runtime is not active')
    return _ACTIVE[0]['resources'][relative]


def run():
    try:
        manifest = activate()
    except Exception:
        print('COAir protected startup rejected: artifact, key or device license verification failed.', file=sys.stderr)
        raise SystemExit(78)
    print('COAir protected pilot verified: ' + manifest['release'], flush=True)
    import uvicorn
    uvicorn.run('backend.main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8080')), workers=1)

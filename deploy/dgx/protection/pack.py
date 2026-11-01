"""Package a staged /app tree. Secrets are mounted from outside the build tree."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

AAD = b'coair-protected-pilot-v1'

def sign(data, key):
    raw = json.dumps(data, sort_keys=True, separators=(',', ':')).encode()
    return {'payload': base64.b64encode(raw).decode(), 'signature': base64.b64encode(key.sign(raw)).decode()}


def package(root, key, signer, release):
    for path in root.rglob("._*"):
        if path.is_file():
            path.unlink()
    for name in ('coair_protected.py', 'compile.py', 'pack.py'):
        (root / name).unlink(missing_ok=True)
    shutil.rmtree(root / 'build', ignore_errors=True)
    sources = {}
    compiled = []
    for path in sorted(root.rglob('*.py')):
        relative = path.relative_to(root).as_posix()
        if list(path.parent.glob(path.stem + '.*.so')):
            compiled.append(relative)
        else:
            sources[relative] = path.read_text()
        path.unlink()
    resources = {}
    for name in ('chronology_v2.yaml', 'chronology_v3.yaml'):
        path = root / 'config/prompts' / name
        resources[path.relative_to(root).as_posix()] = path.read_text()
        path.unlink()
    for pattern in ('*.pyc', '*.pyo', '*.c', '*.pyx', '*.pyd', '*.map'):
        for path in root.rglob(pattern):
            path.unlink()
    for path in list(root.rglob('__pycache__')):
        shutil.rmtree(path, ignore_errors=True)
    for name in ('build', '.git'):
        shutil.rmtree(root / name, ignore_errors=True)
    for name in ('coair_protected.py', 'compile.py', 'pack.py'):
        (root / name).unlink(missing_ok=True)
    if list(root.rglob('*.py')):
        raise RuntimeError('Unexpected unprotected Python source remains')
    protected = root / 'protection'
    protected.mkdir(exist_ok=True)
    nonce = os.urandom(12)
    payload = json.dumps({'sources': sources, 'resources': resources}).encode()
    (protected / 'application.enc').write_bytes(nonce + AESGCM(key).encrypt(nonce, payload, AAD))
    files = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(root.rglob('*')) if p.is_file() and p.name != 'manifest.json'}
    manifest = {'format': 1, 'release': release, 'files': files,
                'encrypted_modules': len(sources), 'compiled_modules': compiled + ['coair_protected'],
                'encrypted_resources': len(resources), 'protection': 'software-key-pilot'}
    (protected / 'manifest.json').write_text(json.dumps(sign(manifest, signer)))
    print(json.dumps({k: v for k, v in manifest.items() if k != 'files'}))

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--root', type=Path, required=True)
    p.add_argument('--secrets', type=Path, required=True)
    p.add_argument('--release', required=True)
    a = p.parse_args()
    package(a.root, (a.secrets / 'device.key').read_bytes(),
            Ed25519PrivateKey.from_private_bytes((a.secrets / 'signing.key').read_bytes()), a.release)

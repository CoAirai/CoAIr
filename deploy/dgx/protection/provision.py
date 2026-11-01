"""Run on the developer machine. Never send signing.key to a customer device."""
import argparse
import hashlib
import os
from pathlib import Path
import json
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from pack import sign

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--secrets', type=Path, required=True)
    p.add_argument('--identity-file', type=Path, required=True)
    p.add_argument('--runtime-output', type=Path, required=True)
    a = p.parse_args()
    a.secrets.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(a.secrets, 0o700)
    for name, value in [('signing.key', Ed25519PrivateKey.generate().private_bytes(
            serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())),
            ('device.key', os.urandom(32))]:
        target = a.secrets / name
        if not target.exists():
            with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as f:
                f.write(value)
    signer = Ed25519PrivateKey.from_private_bytes((a.secrets / 'signing.key').read_bytes())
    public = signer.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    identity = a.identity_file.read_text().strip()
    if not identity:
        raise ValueError('Empty machine identity')
    license_data = {'product': 'coair-local-pilot', 'device': hashlib.sha256(identity.encode()).hexdigest(),
                    'key_sha256': hashlib.sha256((a.secrets / 'device.key').read_bytes()).hexdigest()}
    license_path = a.secrets / 'license.json'
    if license_path.exists():
        from runtime import signed_payload
        previous = signed_payload(json.loads(license_path.read_text()), signer.public_key())
        if previous.get('device') != license_data['device']:
            raise ValueError('Use a separate secrets directory for a different device')
    license_path.write_text(json.dumps(sign(license_data, signer)))
    os.chmod(license_path, 0o600)
    runtime = Path(__file__).with_name('runtime.py').read_text().replace('BUILD_REPLACES_THIS', public.hex())
    a.runtime_output.write_text(runtime)
    print('Device key, signed pilot license and public-key launcher prepared; no secrets printed.')

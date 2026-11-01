"""Destructive tests use disposable containers and temporary copies, never live files."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--image', default='coair-api:dgx-protected-pilot')
    p.add_argument('--secrets', type=Path, required=True)
    p.add_argument('--ciphertext', type=Path, required=True)
    a = p.parse_args()
    results = {}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / 'bad-key').write_bytes(os.urandom(32))
        (root / 'bad-identity').write_text('a-different-device')
        raw = bytearray(a.ciphertext.read_bytes()); raw[-1] ^= 1
        (root / 'bad-ciphertext').write_bytes(raw)
        for case in ('missing-key', 'wrong-key', 'wrong-device', 'tampered-payload'):
            mounts = [(a.secrets / 'license.json', '/run/secrets/coair-license.json'),
                      (root / 'bad-identity' if case == 'wrong-device' else Path('/etc/machine-id'), '/run/coair-machine-id')]
            if case != 'missing-key':
                mounts.append((root / 'bad-key' if case == 'wrong-key' else a.secrets / 'device.key', '/run/secrets/coair-protection.key'))
            if case == 'tampered-payload':
                mounts.append((root / 'bad-ciphertext', '/app/protection/application.enc'))
            command = ['docker', 'run', '--rm', '--network', 'none']
            for source, target in mounts: command.extend(['-v', f'{source}:{target}:ro'])
            r = subprocess.run(command + [a.image], capture_output=True, text=True, timeout=60)
            results[case] = r.returncode == 78 and 'protected startup rejected' in r.stderr
            if not results[case]:
                raise RuntimeError(f'{case}: expected protected refusal, exit={r.returncode}')
    print(json.dumps({'negative_image_tests': results, 'passed': all(results.values())}))


if __name__ == '__main__':
    main()

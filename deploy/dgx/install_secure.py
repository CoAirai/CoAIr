"""Install an isolated protected release using existing local inference only.

Run on the DGX after the signed image has passed its protection checks. The
private signing key is never needed here. Existing app data is not mounted.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess


def command(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--image', required=True)
    p.add_argument('--destination', type=Path, default=Path('/home/coair/coair-secure'))
    p.add_argument('--inference-container', default='coair-local-api-1')
    a = p.parse_args()
    os.umask(0o077)
    root = a.destination
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ('compose.secure.yaml', 'nginx.secure.conf', 'model-proxy.conf.template'):
        shutil.copyfile(Path(__file__).with_name(name), root / name)
    inspected = json.loads(command('docker', 'inspect', a.inference_container).stdout)[0]
    original = dict(x.split('=', 1) for x in inspected['Config']['Env'] if '=' in x)
    for key in ('LLM_API_KEY', 'EMBEDDING_API_KEY'):
        if not original.get(key):
            raise RuntimeError(f'Existing private inference credential missing: {key}')
    env_path = root / 'secure.env'
    env = {}
    if env_path.exists():
        env = dict(line.split('=', 1) for line in env_path.read_text().splitlines() if '=' in line)
    env.update({
        'SECURE_API_IMAGE': a.image,
        'POSTGRES_PASSWORD': env.get('POSTGRES_PASSWORD') or secrets.token_hex(32),
        'QDRANT_API_KEY': env.get('QDRANT_API_KEY') or secrets.token_hex(32),
        'JWT_SECRET': env.get('JWT_SECRET') or secrets.token_hex(48),
        'LLM_API_KEY': original['LLM_API_KEY'],
        'EMBEDDING_API_KEY': original['EMBEDDING_API_KEY'],
        'LLM_MODEL': original['LLM_MODEL'],
        'LLM_CONTEXT_TOKENS': original.get('LLM_CONTEXT_TOKENS', '131072'),
        'LLM_LOCAL_OUTPUT_TOKENS': original.get('LLM_LOCAL_OUTPUT_TOKENS', '32768'),
        'COAIR_ENV': 'production', 'COAIR_DEBUG_MFA': '0',
        'CORS_ORIGINS': 'http://100.91.121.116:18082',
        'COAIR_PUBLIC_ORIGIN': 'http://100.91.121.116:18082',
        'INGEST_MAX_CONCURRENCY': '2', 'OCR_MAX_WORKERS': '2',
        'OCR_MAX_PAGES': '0', 'OCR_LANG': 'eng', 'OMP_NUM_THREADS': '2',
        'EVENT_INDEX_MAX_CONCURRENCY': '1', 'REPORT_MAX_CONCURRENCY': '1',
        'TOKENIZERS_PARALLELISM': 'false',
    })
    if any('\n' in v or '\r' in v or '$' in v for v in env.values()):
        raise RuntimeError('Runtime values must be safe literal dotenv values')
    env_path.write_text(''.join(f'{k}={v}\n' for k, v in env.items()))
    env_path.chmod(0o600)
    for name in ('device.key', 'license.json'):
        if not (root / 'secrets' / name).is_file():
            raise RuntimeError(f'Provision protected runtime secret first: {name}')
    compose = ['docker', 'compose', '--env-file', str(env_path), '-f', str(root / 'compose.secure.yaml')]
    command(*compose, 'config', '--quiet')
    command(*compose, 'up', '-d', '--wait', '--wait-timeout', '180')
    print(json.dumps({'installed': True, 'image': a.image, 'url': 'http://100.91.121.116:18082',
                      'existing_data_mounted': False, 'cloud_keys_configured': False}))


if __name__ == '__main__':
    main()

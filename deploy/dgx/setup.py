#!/usr/bin/env python3
"""Generate appliance secrets once; never overwrite an existing installation."""
import argparse
import getpass
import os
from pathlib import Path
import secrets

parser = argparse.ArgumentParser()
parser.add_argument('--model-url', required=True)
parser.add_argument('--model', default='qwen3-8b')
parser.add_argument('--bind', default='127.0.0.1')
parser.add_argument('--port', type=int, default=8080)
parser.add_argument('--import-directory', default='./inbox')
args = parser.parse_args()
key = os.environ.get('LLM_API_KEY') or getpass.getpass('Local model API key: ')
values = dict(POSTGRES_PASSWORD=secrets.token_hex(24), QDRANT_API_KEY=secrets.token_hex(32),
              EMBEDDING_API_KEY=secrets.token_hex(32),
              JWT_SECRET=secrets.token_hex(48), LLM_BASE_URL=args.model_url,
              LLM_API_KEY=key, LLM_MODEL=args.model, MODEL_UPSTREAM=args.model_url.rstrip("/").removesuffix("/v1"), LLM_CONTEXT_TOKENS='32768',
              LLM_LOCAL_OUTPUT_TOKENS='4096', BIND_ADDRESS=args.bind,
              HTTP_PORT=str(args.port), IMPORT_DIRECTORY=args.import_directory)
for value in values.values():
    if any(c in value for c in "\r\n'$"):
        raise SystemExit('Unsupported character in configuration')
path = Path(__file__).parent / '.env'
with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
    stream.write(''.join(f"{k}='{v}'\n" for k, v in values.items()))
print('Configuration created. Secrets are in deploy/dgx/.env (owner read/write only).')

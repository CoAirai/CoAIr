"""Create new local pilot secrets. Do not print secrets or reuse user/database data."""
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parent
out = root / 'demo.env'
if out.exists():
    raise SystemExit('demo.env already exists; refusing to overwrite.')
old = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines()
           if line and not line.startswith('#') and '=' in line)
values = {k: old[k] for k in ('LLM_API_KEY', 'MODEL_UPSTREAM')}
values.update(POSTGRES_PASSWORD=secrets.token_hex(32), QDRANT_API_KEY=secrets.token_hex(32),
              EMBEDDING_API_KEY=secrets.token_hex(32), JWT_SECRET=secrets.token_hex(48),
              COAIR_ACCESS_PLAN='demo', BIND_ADDRESS='127.0.0.1', HTTP_PORT='18081',
              PILOT_API_IMAGE='coair-api:protected-20261002-demo-pilot',
              DEPLOYMENT_MODE='local', AUTH_PROVIDER='local',
              EMAIL_DELIVERY_MODE='dry-run', SMTP_HOST='', RESEND_API_KEY='',
              LOCAL_METADATA_ENABLED='true')
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    for key, value in values.items():
        if '\n' in value or '\r' in value:
            raise ValueError('Invalid environment value')
        f.write(f'{key}={value}\n')
print('Created demo.env with independent application/database secrets.')

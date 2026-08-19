# COAir API (FastAPI)

Backend for COAir: auth, organizations, projects, chat, chronology, forensic, billing.

## Quick start (local)

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api python scripts/seed_sandbox.py
curl http://localhost:8000/api/health
```

## Production

Deploy this folder on a Linux VPS with Docker. Full guide:

**[../docs/DEPLOY.md](../docs/DEPLOY.md)** — Part 2 (VPS setup, nginx, env vars).

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Nginx config: [`../deploy/nginx/coair-api.conf`](../deploy/nginx/coair-api.conf)

## Docs

- [Super Admin API reference](docs/superadmin-api/README.md)
- [Backend README](README.md) (engine architecture)

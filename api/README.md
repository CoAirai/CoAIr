# COAir

A document-analysis platform for construction claims. It answers questions over
a project's contracts, correspondence and spreadsheets with page-level
citations, builds delay chronologies from the evidence, and runs forensic
programme analysis.

- **Python + FastAPI** backend, **React + TypeScript + Vite + Tailwind** frontend
- **Qdrant** for vectors, **DuckDB** for tabular queries, **SQLite** for accounts
  and jobs
- Gemini for reasoning; embeddings run locally (ONNX bge-base) with no API key
- JWT auth, organizations → projects → per-project roles

## Run it

```bash
cp .env.example .env         # set JWT_SECRET; GOOGLE_API_KEY can stay empty
docker compose up -d --build # ~20 min cold: it builds the frontend and the wheels
docker compose exec api python scripts/seed_sandbox.py
```

The seed prints its accounts and a password. Open **http://localhost:8000** —
the API serves the built SPA, so that one port is the whole product.
`/docs` is the interactive schema.

**Without `GOOGLE_API_KEY`** (and without Z.AI configured) everything still works except the parts that need a
model: accounts, organizations, projects, upload, ingestion, search, the library
and all admin surfaces. Chat returns a valid response whose text says it found
nothing; report generation fails. Fill **`GOOGLE_API_KEY`** or set **`LLM_PRIMARY_PROVIDER=zai`** with **`ZAI_API_KEY`** for free GLM chat.

### Working on the frontend

```bash
cd frontend && npm install && npm run dev    # :3000, proxies /api to :8000
```

## Where things are

| | |
|---|---|
| `backend/` | The FastAPI app: routes, auth, organizations, dependencies, background workers |
| `src/` | The engine: retrieval, routing, ingestion, chronology, billing and the stores |
| `frontend/` | The React SPA, built into `frontend/dist` and served by the API |
| `deploy/sandbox/` | A self-contained compose stack for someone who only wants the API running |
| `docs/superadmin-api/` | The integration pack: every endpoint, the permission model, error contracts, examples |
| `scripts/` | Provisioning and migration CLIs — `create_user.py`, `seed_sandbox.py`, `backfill_orgs.py` |
| `vendor/` | The Delay Analysis Toolkit, a separate Streamlit app served at `/toolkit/` |
| `docs/internal/` | Our own deployment runbooks and working notes |

## Building against the API

Start with **[docs/superadmin-api/README.md](docs/superadmin-api/README.md)**. It
documents all 130 operations, who may call each one, the error envelopes, and
ships TypeScript types and a runnable request collection.

Two things that cost people a day:

- Content endpoints need an **`X-Project-ID`** header and answer `428` without
  it. Admin and organization endpoints must not receive it.
- A browser blocks a cross-origin call before the token is ever checked, so a
  missing **`CORS_ORIGINS`** entry looks like an auth bug.

## Roles

Three independent axes, explained in full in
[docs/superadmin-api/PERMISSIONS.md](docs/superadmin-api/PERMISSIONS.md):

- **Platform role** (`user` / `admin` / `superadmin`) — ours, cross-organization.
- **Organization role** (`owner` / `member`) — the customer's. An organization
  `owner` is the company's SuperAdmin: it reaches every project the company
  owns, creates the company's users and grants them project access. It is a
  plain platform `user`, so gate a customer-facing panel on `GET /api/org`, not
  on the account's global role.
- **Project role** (`owner` / `editor` / `viewer`) — what you may do with a
  project's data.

## Tests

```bash
pytest tests/ --ignore=tests/test_hardening.py --ignore=tests/test_integration.py
```

Those two files are script-style and call `sys.exit()` at import, so pytest
cannot collect them.

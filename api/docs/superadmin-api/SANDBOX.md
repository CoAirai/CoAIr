# Run the API Yourself

A sandbox: the real backend, on your machine, with a seeded company you can log
into. Nothing in it talks to our servers.

## Start it

The env template ships with the source:

```bash
cd deploy/sandbox
cp .env.sandbox.example .env
```

Then fill the two blank lines:

| | |
|---|---|
| `JWT_SECRET` | Generate your own: `python -c "import secrets;print(secrets.token_urlsafe(48))"`. It signs your sandbox's tokens, and is unrelated to ours. |
| `GOOGLE_API_KEY` | Sent separately, if at all. **Leave it empty to start** — see what that costs you below. |

And start it:

```bash
docker compose -f docker-compose.sandbox.yml up -d --build
docker compose -f docker-compose.sandbox.yml exec api python scripts/seed_sandbox.py
```

`--build` builds the image from this checkout: roughly 20 minutes and 3 GB the
first time, then cached. (If you were given a registry token instead, drop
`--build` and `docker login ghcr.io` first — but building is the normal path.)

The seed prints the accounts and a password. `http://localhost:8000` is the API,
`http://localhost:8000/docs` the interactive schema.

Everything the sandbox writes lives in `./storage`, `./data` and
`./qdrant_storage` beside the compose file. Delete those three and re-seed for a
clean slate.

## What you get

`scripts/seed_sandbox.py` creates one company with deliberately uneven access,
so your screens have something real to render:

| Account | Role | Sees |
|---|---|---|
| `acme-admin` | **company SuperAdmin** (org `owner`) | Both projects, every user, all the `/api/org/*` routes. Start here. |
| `acme-engineer` | company member | One project, as `editor` |
| `acme-surveyor` | company member | The same project, as `viewer` |
| `ops` | our platform operator (`superadmin`) | Everything, plus `/api/admin/*` |

`--org "Beta Ltd" --slug-prefix beta` adds a second company, which is the
fastest way to check your UI never leaks one company into the other.

There is a `--with-documents` flag, but it ingests from `data/`, which ships
empty — the documents in it are client material and are not in the repository.
It will print "no sample files" and carry on. To get real documents into the
library, upload one through `POST /api/upload` (or the UI) against a project and
watch `/api/indexing/status`; that path works with no provider key.

## What works with no provider key

Verified on a fresh sandbox, `GOOGLE_API_KEY` empty:

| | |
|---|---|
| **Works fully** | Auth, `/api/org/*`, `/api/admin/*`, projects and members, upload, ingestion, `/api/files`, `/api/library`, `/api/indexing/*`, `/api/knowledge`, conversations, `/api/usage`, `/api/runs`. A CSV uploaded this way really does become a registered table — `/api/stats` counts it. |
| **Answers, but not intelligently** | `POST /api/chat` returns a valid `200` with a real `ChatResponse`; the text is "No relevant document excerpts were found for this question." and routing may pick the wrong lane, because query classification and answer synthesis are the parts that need the model. Good enough to build and style the chat UI against. |
| **Does not finish** | Report generation. `POST /api/chronology/generate` returns `202`, the job appears in `GET /api/reports`, and it ends in `status: "failed"` — which is a state worth designing for anyway. |

Fill in the key and chat and reports come alive; nothing else changes.

## Two things that cost people a day

1. **`X-Project-ID`.** Content endpoints — chat, files, library, documents,
   reports — answer **`428 project_required`** without it. Admin and
   organization endpoints must **not** receive it. Get a project id from
   `GET /api/projects` or `GET /api/org/projects`.
2. **CORS.** The browser blocks a cross-origin call before your token is ever
   checked, so it looks like an auth bug. `CORS_ORIGINS` in `.env` lists the
   origins allowed; add yours, scheme and port included. `*` is not valid — the
   API sends credentials. Alternatively proxy `/api` through your own dev
   server and the question disappears — `frontend/vite.config.ts` already
   proxies `/api` to port 8000, which is what this sandbox publishes.

## The spend cap

`COAIR_USAGE_LIMIT_USD` in `.env` is a hard ceiling on cumulative LLM spend for
the sandbox. Past it, `/api/chat` answers `402 budget_exceeded` instead of
calling the provider. `GET /api/usage` shows `limit_usd`, `used_usd` and
`over_budget` at any time. It exists so a loop in a dev build cannot run up a
bill on a shared key — raise it if you hit it legitimately.

## When something is wrong

```bash
docker compose -f docker-compose.sandbox.yml logs -f api      # the API's own log
curl -s localhost:8000/api/health                             # 200 = up
docker compose -f docker-compose.sandbox.yml exec api \
  python scripts/create_user.py --username you --password '…' --role superadmin
```

`GET /api/health` returning `200` does **not** prove the vector store is
reachable — it is a runtime-dependency check, not a connectivity one. If chat
returns `500` while everything else works, look at the `qdrant` container first.

## Where to read next

[PERMISSIONS.md](PERMISSIONS.md) for who can do what,
[API_REFERENCE.md](API_REFERENCE.md) for every endpoint, and
[examples.http](examples.http) for a company-SuperAdmin walkthrough you can run
against this sandbox by setting `@host = http://localhost:8000`.

# Isolated AWS integration

Branch: `integration/rag-agent-parity`, based on Coair main `ca5302b`.

This stack hosts the existing Coair interface with incremental, tested RAG agent
ports. Coair management and payment rules are preserved. The current AWS RAG service remains
the reference implementation. The integration stack uses its own SQLite stores,
DuckDB, Qdrant and uploads under `/opt/coair-integration`.

Public address: `https://coair-test.duckdns.org`. The owner configured this dedicated hostname for Coair on AWS63. Existing RAG
and dental hostnames and containers are not deployment targets.

## Deployment

The root workflow builds and tests API and Next.js images for the same commit.
Production branches do not trigger this workflow. Pull requests never deploy.
Deploys require repository variable `INTEGRATION_DEPLOY_ENABLED=true` and these
dedicated repository secrets:

- `INTEGRATION_HOST`
- `INTEGRATION_SSH_USER`
- `INTEGRATION_SSH_KEY`
- `INTEGRATION_KNOWN_HOSTS`

Set `INTEGRATION_PUBLIC_ORIGIN` to the public address before building. It is a
build-time Next.js setting. The existing Vercel production build is unchanged.

Before enabling deployment, provision `/opt/coair-integration/api.env` and
`compose.env` with mode 600 and create storage, data, provider-keys and qdrant
directories. `compose.env` contains only the dedicated `INTEGRATION_QDRANT_KEY`.
`api.env` supplies the matching `QDRANT_API_KEY`, a dedicated `JWT_SECRET`, the
test provider key and these staging-only settings:

```dotenv
COAIR_ENV=development
COAIR_DEBUG_MFA=true
COAIR_LOGIN_URL=https://coair-test.duckdns.org
COAIR_USER_URL=https://coair-test.duckdns.org
COAIR_ADMIN_URL=https://coair-test.duckdns.org
COAIR_APP_URL=https://coair-test.duckdns.org
CORS_ORIGINS=https://coair-test.duckdns.org
```

The test hostname has a separate Nginx access password: staging displays
MFA test codes and does not send emails. A server-rendered HttpOnly gate cookie
protects `/coair-api/` while leaving Authorization available for Bearer tokens.
Render `__INTEGRATION_GATE_TOKEN__` in nginx.conf from protected server state;
never commit the token. Compose explicitly disables live payment,
email, Supabase and object-bucket connections. Those are configuration choices,
not changes to Coair payment or management code. Real email/payment integration
needs separate test credentials in a later stage.

Nginx proxies the approved hostname to loopback port 3200 (Next.js). Next.js
forwards `/coair-api/*` to the integration API on the private Compose network.
The API also binds loopback 8200 for operator checks. Never proxy this hostname
to production port 8000. Qdrant has no public port.

`release.py` accepts only matched, commit-tagged integration image pairs. It
waits for container health and the public proxy/login/project smoke check before
marking a release current. On either check failing,
it restores the previously successful image pair. This is an image rollback,
not a database migration rollback; staging schema changes need a separate
compatibility decision before deployment.

## Acceptance for the first stage

- Production RAG health and container identity remain unchanged.
- The test hostname serves Coair assets, with no redirects to live Coair portals.
- A real staging user completes password/MFA login and loads staging projects.
- Browser `/coair-api` calls reach the integration backend, not AWS production.
- No production writable volumes, databases, mail or payment secrets are shared.
- Each later agent patch gets its own commit and regression evidence.

The initial database is intentionally separate. Import a representative,
read-only source sample before comparing agent quality; do not copy a live
users, billing or organization database into this stack.

## Initial qualification (24 October 2026)

The initial deployed Coair baseline passed 50 API tests and 151 frontend tests,
plus the Next.js production build. A real browser completed password/MFA login
and opened the workspace without page errors or missing images. Three original
Edinburgh PDFs were uploaded through the public proxy: CEC01546478,
CEC01123743 and CEC01630357. Keep them as the deployment smoke-test dataset.
They completed indexing and produced eight vectors in the isolated collection.
One real chat answer returned three source citations in 14.43 seconds. This
qualifies the deployment connections; it is not full RAG-agent parity or a
chronology/forensic acceptance benchmark.


## Four-stage acceptance and matched timing

See `docs/integration/FOUR_STAGE_ACCEPTANCE.md` and
`docs/integration/performance-check.json`. CI additionally exercises the existing
PostgreSQL adapter against a disposable PostgreSQL 16 database; it does not attach
to hosted Supabase or migrate staging away from SQLite.

`benchmark_queries.py` is an operator benchmark for disposable containers only.
It refuses storage without a `.matched-qualification` marker. Give each engine
its own cloned storage/data, native user schema and staging-only provider key;
use the same PDF bytes, canonical document IDs, vector collection and model policy.
It measures six actual orchestrator requests and an optional narrative Word report,
records durable run usage and source selection, and disables provider response
caching in both processes. Native routing/retrieval caches remain enabled.
Do not mount production writable storage or copy Coair's user schema into RAG.

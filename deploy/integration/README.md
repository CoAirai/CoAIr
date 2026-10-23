# Isolated AWS integration

Branch: `integration/rag-agent-parity`, based on Coair main `ca5302b`.

This first stage hosts the existing Coair interface and backend without porting
agent behavior or changing payment logic. The current AWS RAG service remains
the reference implementation. The integration stack uses its own SQLite stores,
DuckDB, Qdrant and uploads under `/opt/coair-integration`.

Public address: `https://dental-clinic-app-dev.duckdns.org`. The owner approved
using this former dental development hostname for Coair. Keep the original Nginx
configuration for reverting the hostname; do not remove the dental containers.

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
COAIR_LOGIN_URL=https://dental-clinic-app-dev.duckdns.org
COAIR_USER_URL=https://dental-clinic-app-dev.duckdns.org
COAIR_ADMIN_URL=https://dental-clinic-app-dev.duckdns.org
COAIR_APP_URL=https://dental-clinic-app-dev.duckdns.org
CORS_ORIGINS=https://dental-clinic-app-dev.duckdns.org
```

The test hostname must have a separate Nginx access password: staging displays
MFA test codes and does not send emails. Compose explicitly disables live payment,
email, Supabase and object-bucket connections. Those are configuration choices,
not changes to Coair payment or management code. Real email/payment integration
needs separate test credentials in a later stage.

Nginx proxies the approved hostname to loopback port 3200 (Next.js). Next.js
forwards `/coair-api/*` to the integration API on the private Compose network.
The API also binds loopback 8200 for operator checks. Never proxy this hostname
to production port 8000. Qdrant has no public port.

`release.py` accepts only matched, commit-tagged integration image pairs. It
waits for container health before marking a release current. On health failure,
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

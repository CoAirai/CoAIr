# Azure migration preparation

This branch prepares a controlled move of the existing cloud application.
The end-to-end operator procedure is in [MIGRATION_RUNBOOK.md](MIGRATION_RUNBOOK.md),
with account setup, private Blob, upload/OCR/source acceptance and production cutover. It
contains no Azure credentials, automatic DNS change, production data-copy or
cutover command. Base: `codex/long-document-evidence`, which includes current
main and the qualified cloud agent/report improvements. DGX-only inference and
local authentication settings are not imported.

Before purchasing/provisioning, use [PURCHASE_PLAN.md](PURCHASE_PLAN.md) for the
individual demo account/role/quota checklist and a dated, itemized retail estimate. The
read-only `account_check.py` requires explicit target tenant/subscription IDs;
it never logs in, switches account, grants access or creates resources.
The current budget default is a 2-vCPU/4-GiB B2als_v2 VM with one persistent
64-GiB Standard SSD. A separate data disk and Blob Private Link are optional;
the demo can use a selected-subnet storage service endpoint with default-deny
firewall rules and managed identity. No live network policy was changed.

## Supported topology

- `all-in-one`: web + one authoritative API + private Qdrant on one Linux VM.
- `api-host`: one authoritative API + private Qdrant with a persistent managed
  disk; optionally publish API only on that VM's private VNet address.
- `compose.web.yml`: stateless web on one or more other hosts, forwarding to the same
  authoritative API through `COAIR_API_ORIGIN`.
- `toolkit`: optional existing upstream Streamlit image, preserving `/toolkit/`.
  Enable this profile if the selected source uses that toolkit. Do not replace
  it implicitly with another forensic UI.

The API is **not horizontally scalable yet**. Do not start a second API against
a separate local disk and expect its projects or jobs to synchronize. The
process ownership lock protects cooperating API processes using the *same*
local storage directory; it is not a distributed lease across separate disks.
Topology declaration and deployment ownership must also retain a single API host.

The guarded API acquires `.state-owner.lock` before startup migrations, queue
recovery or background workers. A conflicting process fails startup. The lock
lasts until process exit, including slow model calls beyond shutdown grace.
The Azure profile rejects a declared API replica/worker-process count other than
one. Existing deployments do not change unless they opt into this guard.

## 1. Record the source before copying

Identify whether the source is the RAG production stack, the Coair production VPS
or the small integration fixture. Record immutable API/web/toolkit images,
model/embedding profile, Qdrant collection/dimensions/counts, auth and database
providers, project/corpus ownership, subscriptions and token-ledger baseline.
The same file name is not a document ID. Preserve source IDs and container paths.

Do not replace the production configuration with the integration environment:
that environment intentionally disables payment, email and production databases.

## 2. Inventory originals and identity metadata (read-only)

Run on the source host against the selected application directory:

```sh
python3 deploy/azure/inventory.py inventory /opt/mvp-api \
  --output /secure/migration/source.inventory.json
```

The output directory must already exist and be outside the application root.
The tool writes an owner-only manifest and does not alter source files. It
hashes assets under `data`, `storage` and exported `qdrant_snapshots`, rejects
symlinks and detects changes while hashing. Known secret files/directories are
excluded; protect the manifest because its filenames/IDs are internal metadata.

Live `.db`/SQLite/DuckDB/journal files are identified, not certified or copied.
An inventory is not a consistent backup. Use SQLite's backup API, PostgreSQL
backup/restore, Qdrant's supported snapshot/restore, and a controlled checkpoint
and write pause for DuckDB. Never copy an open live database as if it were an
immutable original. Live `qdrant_storage` is deliberately excluded.

The manifest records the registry's document/project identity digest and counts
legacy records without `project_id`. Resolve those mappings explicitly. Do not
assign every legacy document to whichever test project happens to exist.

After restoring into an isolated target, inventory it and compare:

```sh
python3 deploy/azure/inventory.py inventory /srv/coair \
  --output /secure/migration/target.inventory.json
python3 deploy/azure/inventory.py compare \
  /secure/migration/source.inventory.json /secure/migration/target.inventory.json \
  --output /secure/migration/restore.comparison.json
```

Missing/extra files, changed bytes, IDs or project assignments fail comparison.
Even identical inventories always report `migration_accepted=false`: consistent
state backups, vector model/counts, tenant isolation and application acceptance
are separate gates. Regenerate the baseline from a stable source if a live
registry/asset changed during the initial copy; do not suppress the difference.

## 3. Port and private-service contracts

| Connection | Default | Meaning |
| --- | --- | --- |
| Public TLS proxy -> web | `127.0.0.1:3000` | Keep the public production hostname and TLS policy |
| Web -> authoritative API | `http://api:8000` on one host | For separate hosts use the API VM's private IP/FQDN |
| API -> Qdrant | `http://qdrant:6333` | Docker-private; no public vector database port |
| TLS proxy -> toolkit | `127.0.0.1:8501/toolkit/` | Required only for sources using the upstream toolkit |

API container port is explicitly 8000, web port is 3000. A published host port
may differ; describe the port visible from the *probe host* in the endpoint file.
A Docker service alias such as `api` does not resolve on another VM. Loopback
also refers to the web host itself, not the remote API VM.

Copy `endpoints.example.json`, set actual addresses and expected ports, and run
from each relevant web/proxy/API host:

```sh
python3 deploy/azure/preflight.py endpoints.json
python3 deploy/azure/preflight.py endpoints.json --connect
```

The first command validates configuration only (`network_checked=false`). The
second probes TCP/HTTP without changing resources. It does not follow redirects
or accept a login page as an API health response. It rejects credentials/SAS in
URLs and checks API readiness JSON. A green connectivity check is not a data
migration acceptance certificate. Add the Qdrant TCP check from its network and
a toolkit endpoint with `check=toolkit_health` as appropriate for the selected source.

## 4. Prepare the Azure VM deployment

1. Select Linux x86_64 and a persistent managed disk backing application state.
   The budget demo can use the persistent OS disk; a separate data disk is optional.
   Preserve `/app/data`
   and `/app/storage` container paths. Do not put active databases on a temporary
   VM disk or assume Azure Files makes them safe for multiple API writers.
2. Copy `.env.example` to a private `.env`; set qualified immutable API/web image
   tags from the same tested commit. The web image must be built with the actual
   `PUBLIC_ORIGIN`; changing `NEXT_PUBLIC_*` only at runtime is insufficient.
3. Securely copy the selected production API environment to `api.env`. Its
   example is intentionally incomplete. Preserve auth, JWT signing, database,
   model, embedding, vector collection, project/corpus, billing and email settings.
   The Qdrant API key in API configuration must match the Qdrant service key.
4. Set `STATE_ROOT` to the persistent disk directory. Restore with correct
   ownership for the qualified image. Never reuse the production data directory
   as a staging target. Storage and Qdrant have separate ownership requirements.
5. Validate before starting containers:

```sh
docker compose --env-file .env --profile all-in-one -f compose.yml config --quiet
```

For separate web hosts, use `--profile api-host` on the API VM. On each web
VM copy only `compose.web.yml` and `web.env.example`, configure a private
`web.env`, then validate with:

```sh
docker compose --env-file web.env -f compose.web.yml config --quiet
```

Web-only hosts require no API secret file, database credentials or vector key. On the API host, explicitly set
`API_BIND_IP` to its private VNet IP. On web hosts set `API_ORIGIN` to that private
IP/FQDN. Keep API/Qdrant out of public ingress; allow the actual web hosts in the
private network policy. The Compose profile never configures an Azure NSG/DNS.

The qualified toolkit can be enabled with `--profile toolkit` alongside the
chosen profile after setting `TOOLKIT_IMAGE`. Keep its credential separate from
the billed API credential and do not mount API documents, stores or secret files.
Its sessions are process-local: route a session consistently if the toolkit is
scaled in a future deployment.

Retain the public reverse proxy's source configuration: TLS, `/coair-api/`,
WebSocket upgrade for the toolkit, request-size policy, `proxy_buffering off` for
SSE and report/job timeouts. The Compose file intentionally does not invent a
new certificate or expose an unqualified public gateway.

## 5. Next stage before multiple stateful API/worker hosts

The following are required changes, not capabilities claimed by this branch:

- Move remaining file-backed job/review/report state to a qualified shared store;
  PostgreSQL for core accounts alone does not migrate every queue/local record.
- Introduce atomic shared job claims, leases with fencing, heartbeat and safe
  recovery. Starting another replica must not requeue an active owner's work.
- Separate worker lifecycle from HTTP replicas, preserving project/user identity,
  cancellation, progress, billing idempotency and restart behaviour.
- Separate mutable lexical indexing from request replicas; keep DuckDB's single
  writer or adopt an explicitly qualified shared-search service.
- Make originals/canonical artifacts/report outputs available to every permitted
  reader through a provider-aware store. Test cold-cache retrieval and expiring
  upload links. The opt-in Azure adapter uses the existing authenticated proxy
  upload and private Blob objects; real Azure credentials/network/corpus
  qualification remain required before cutover.
- Use shared rate limiting/session state where required; preserve auth providers
  and transactional payment/token accounting. Do not fan out API traffic until
  cross-host ownership and idempotency tests pass.

## 6. Acceptance gates before data/traffic cutover

Require: consistent restore + asset hashes + vector identity/counts; two projects
with same-name documents and denied cross-tenant access; new scanned PDF/Excel
indexing; equivalent chat/SQL/chronology/toolkit results; source-page resolution;
valid Word/Excel output; correct roles/demo/account state and payment/token
ledgers; interrupted-job recovery and a cold restart. Use safe test identities
and provider test modes for side effects. Do not charge real customers during QA.

Only then freeze new writes briefly, reconcile the final delta, switch traffic
and retain a qualified rollback with a record of post-cutover writes. This branch
never performs those operations automatically.

## Validation

Run in a Python environment with the pinned Azure SDK dependencies installed
(`azure-storage-blob==12.31.1` and `azure-identity==1.27.0`, constrained by
`api/requirements.lock`), or inside the qualified API image.

```sh
python3 -m unittest discover -s deploy/azure/tests -v
```

The tests exercise same-size corruption, missing/extra files, project/document
reassignment, symlink escape, secret exclusion, invalid ports/hosts, unready or
redirected health checks, and real competing API processes on one directory.
CI runs these tests and validates the Compose profiles before normal cloud
API/UI/database checks. This branch is excluded from the AWS integration deploy
job; pushing it does not update AWS, Coair production or DGX.

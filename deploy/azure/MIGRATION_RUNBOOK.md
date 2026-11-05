# Azure account, Blob, OCR and production migration

This is an operator runbook, not an automatic production release. Resource
creation commands have not been run. Azure connectivity, identity permissions,
customer data restore and production acceptance require the real target account.
Keep this branch separate from main until cloud qualification is complete.

## 1. Open the owner-controlled Azure account

1. For the current sales demo, use a personally owned Microsoft account and a
   normal Pay-As-You-Go subscription; incorporation is not required. Confirm
   the actual tenant, subscription, billing owner, recovery owner and MFA. If
   operators are added, use named access rather than sharing the owner's password.
   See PURCHASE_PLAN.md for the Türkiye signup/payment and AWS sizing comparison.
2. Record the subscription ID and tenant ID privately. Verify them with
   `az login` and `az account show`; select the intended subscription with
   `az account set --subscription <subscription-id>` before any resource change.
3. Choose the region based on the customer's data residency requirements and
   the source database/model network latency. Record the actual source stack:
   RAG AWS production, Coair production VPS, and integration staging are
   different datasets/configurations. Do not use the small staging corpus as
   the production migration source.
4. Create separate staging/production resource groups, VNet/subnets and storage
   containers/accounts. Keep staging credentials and customer copies private.
5. Record the current production images, commit, model/embedding configuration,
   disk usage and measured peak RAM/CPU. Size the VM and persistent managed disk
   against those measurements, including temporary upload/OCR/download space.
   This branch does not establish an unmeasured low-RAM hosting guarantee.

The Azure account is an infrastructure identity. Coair users remain application
records; creating an Azure tenant does not migrate or replace their logins.

## 2. Prepare the target network and runtime

1. Start with one authoritative API/Qdrant host on a persistent managed disk;
   use `compose.yml` profiles from README. Separate web hosts use only
   `compose.web.yml`. Multiple API writers remain unsupported.
2. Expose HTTPS through the qualified reverse proxy. Keep the existing host
   routing, auth paths, `/coair-api/` proxy contract, SSE buffering policy,
   toolkit WebSockets and download/request timeouts. Do not redirect an API
   request to a login HTML page and treat that as a health success.
3. Configure NSG/firewall rules using the real path between hosts:

| Caller -> destination | Port | Acceptance |
| --- | --- | --- |
| Customer -> TLS proxy | 443 | Correct hostname, trusted TLS, login, SSE, report download |
| Operator -> VM | 22 | Restricted management path; no public database access |
| Web -> API | private 8000 | `/api/health` ready JSON; verify actual published port |
| API -> Qdrant | private 6333 | Correct API key, restored collection and dimensions |
| API/migration host -> Blob | 443 | Private DNS and Entra-authorized object access |
| API -> Entra/model/email/payment endpoints | 443 | Real selected provider contracts |
| API -> PostgreSQL, if selected | private/provider 5432 | TLS/provider policy; schema and restored IDs |
| Proxy -> optional toolkit | private 8501 | Existing `/toolkit/` session/WebSocket works |

4. Run `preflight.py endpoints.json --connect` from each relevant host. DNS must
   work inside the API container as well as on its VM. A private Blob endpoint
   uses the normal account hostname resolving to its private IP through private
   DNS, not a manually substituted IP in the application URL.
5. Qualify the exact API/web image pair. Keep cloud inference providers from the
   chosen production source; no DGX/local-model configuration is imported.

## 3. Create private Blob storage and grant the API identity access

For the current budget demo, the selected network path is a **Microsoft.Storage
service endpoint** on the application subnet, with storage public network access
limited to selected networks, firewall default Deny, an explicit allowed subnet,
private containers and managed-identity data authorization. This uses the normal
public-addressed Blob hostname; it is not a Private Link/private-IP endpoint.
There is no separate private endpoint or private DNS zone charge in that profile.
Verify both authorized API access and rejected unapproved-network access.

The Private Link steps below are an optional stricter network alternative. Do
not disable public network access when using only a service endpoint: that would
block the selected access path. Never choose All networks or anonymous access.

1. In the Azure portal, create a Standard StorageV2 account. Use the flat Blob
   namespace for this migration; do not introduce ADLS Gen2/HNS as another
   simultaneous change. Select Hot storage and the agreed redundancy policy.
2. Require HTTPS and TLS 1.2+, disable anonymous Blob access, and create private
   containers. Separate staging and production; do not share the staging
   container with a running production API.
3. If selecting Private Link, create its endpoint and private DNS zone linked to the API VNet.
   Put the migration host on an authorized network path too. Disable public
   storage network access after the private path is verified; an Entra login
   alone does not bypass network policy.
4. Enable the API VM's managed identity. Assign **Storage Blob Data Contributor**
   on the specific application container to that identity. Azure control-plane
   Contributor/Owner alone is not the Blob data role. The client uses
   `DefaultAzureCredential`; no storage account key or SAS enters the browser.
5. A named migration operator needs appropriate data access separately. If
   using a user-assigned identity, set its client ID in `AZURE_CLIENT_ID`.
   Validate access from the container's actual runtime identity, not only from
   an administrator's Azure CLI session. Allow for RBAC propagation and confirm
   the effective identity before retrying a 403.
6. Merge `blob.env.example` into the target's protected `api.env`. Replace the
   account/container placeholders. Keep other source providers, JWT signing,
   relational connection, project IDs and billing configuration intact. Stale
   AWS settings do not override explicit `OBJECT_STORAGE_BACKEND=azure`. Remove
   source AWS credentials from the target after confirming no other selected
   provider needs them; migration credentials belong only on the migration host.
7. Configure retention/versioning and backup according to the customer's policy.
   A soft-deleted blob is not a consistent relational/vector backup. Do not add
   a lifecycle rule that archives active citation originals.

## 4. Establish a consistent migration baseline

1. Capture source users, organizations, roles, invitations/demo requests,
   projects/memberships, subscriptions, storage/token ledgers and document IDs.
   Record counts and ownership in a protected acceptance record.
2. Record source Qdrant collection, vector count, dimensions and embedding
   model. Preserve these; changing embedding models requires a separate reindex.
3. Use `inventory.py` against the selected source and resolve missing legacy
   project mappings. Do not infer membership from a matching filename.
4. Export PostgreSQL/SQLite with their supported consistent backup mechanisms;
   checkpoint/copy DuckDB only under controlled writes, and export Qdrant
   snapshots through its supported API. Include file-backed ingestion/report/
   forensic/event jobs, review state, conversations, catalog, registry, graph,
   glossary and generated reports. Inventory JSON is not this backup.
5. Restore these stores into isolated staging while preserving `/app/data` and
   `/app/storage` paths, IDs and ownership. Start no competing production worker
   against the source databases, payment webhooks or shared writable bucket.
6. Inventory the restored tree and compare it with the baseline. Explain every
   difference. Keep `OBJECT_STORAGE_RESTORE_ON_STARTUP=false` on the Azure target
   so an old object mirror cannot overwrite the restored local registry/catalog.
   On-demand original/canonical retrieval remains enabled.

## 5. Plan and copy originals without breaking references

Create an object plan from the stable filesystem inventory:

```sh
python3 deploy/azure/blob_assets.py plan /secure/migration/source.inventory.json \
  --output /secure/migration/blob.plan.json
```

The plan preserves the existing application keys:

| Source | Target object key | State treatment |
| --- | --- | --- |
| `data/<relative-path>` | `uploads/<relative-path>` | Original bytes; retain company/project directories |
| `storage/canonical_events/<project>/<version>/canonical-text.jsonl.gz` | `canonical-events/<project>/<version>/canonical-text.jsonl.gz` | Preserve segment IDs/page locators |
| `storage/parquet/<name>.parquet` | `tables/<name>.parquet` | Copy with the corresponding consistent catalog |
| Registry, catalogs, accounts, ledgers, queues, live DBs | Not a Blob asset transfer | Consistent state restore from step 4 |
| Qdrant | Not an original-file Blob copy | Supported collection snapshot restore |

If originals exist only in S3, export a paginated key/size/version inventory too;
the local inventory cannot certify files absent from its disk. Resolve each
registered original/canonical reference to a planned key. Obtain an immutable
version/consistent copy and its checksum for those objects before accepting the
corpus. Never report full coverage from a five-document sample.

Use AzCopy or Storage Explorer from the migration network. For S3, use a scoped
read-only AWS identity and a separate Azure migration identity. For example,
first preview an existing `uploads/` prefix while preserving its name:

```sh
azcopy login
azcopy copy 'https://s3.amazonaws.com/SOURCE_BUCKET/uploads/*' \
  'https://TARGET_ACCOUNT.blob.core.windows.net/TARGET_CONTAINER/uploads/' \
  --recursive=true --overwrite=false --dry-run
```

Review against the plan, then run the reviewed command without `--dry-run`.
Repeat explicitly for `canonical-events/` and required `tables/*.parquet` keys;
do not run a whole-bucket sync or delete destination extras automatically. An
existing conflicting object is a failed reconciliation, not a reason to force
overwrite. The first load and final delta must use the same validated mapping.
Local-only originals use the same mapping through a reviewed local-to-Blob copy.

Existing `s3://bucket/key` canonical references stay unchanged. Set
`AZURE_MIGRATION_SOURCE_S3_BUCKET` to that exact source bucket; the Azure reader
then resolves the same key in the selected private container. Unmapped buckets
are rejected. Native Azure references are `az://account/container/key`, never
expiring SAS URLs. GCS sources have a separate explicit source-container alias.
No database search-and-replace or blanket reinjection is needed for an otherwise
complete, byte-identical corpus.

After copying, verify **remote bytes**, using the target API environment:

```sh
PYTHONPATH=api python3 deploy/azure/blob_assets.py verify \
  /secure/migration/blob.plan.json --output /secure/migration/blob.verification.json
```

This streams SHA-256 checks at a fixed object ETag without downloading a second
corpus to disk. Equal sizes or copied metadata alone do not pass. It does not
certify database consistency or account/project authorization.

## 6. Qualify OCR together with upload and source opening

The default OCR path is local Tesseract + PyMuPDF/pytesseract. Azure hosting does
not automatically require Azure AI Document Intelligence. Preserve the qualified
OCR engine, language, DPI, page cap and selective model fallback policy.
`OCR_MAX_PAGES` currently defaults to 500; record actual source/target values
and test at/above the corpus's real page counts. Copying storage must not silently
change extraction coverage. A page-cap warning is not proof of a complete index.

1. Check the actual image contains the Tesseract executable and the requested
   language data. Keep `OCR_MODE=auto`, English language and one OCR worker unless
   the measured source profile requires another qualified setting.
2. Run the synthetic checker inside the isolated target API container. Mount the
   repository's `deploy/azure` read-only as `/qualification`, set `PYTHONPATH=/app`,
   and run `python /qualification/runtime_check.py --ocr`. It rasterizes text
   into a scanned PDF and requires actual OCR output. CI runs it with no network;
   it makes no model call and writes no application record/vector.
3. Once Azure access exists, run `python /qualification/runtime_check.py --ocr
   --blob` in staging with the same runtime identity. It writes a unique
   `migration-probes/` object, downloads cold, compares SHA-256 and deletes its
   own object. With `--ocr --blob`, it also OCRs the cold-downloaded scan with
   a fresh temporary OCR cache. This synthetic check does not replace the authenticated workflow
   below or certify a production corpus.
4. In the UI, sign in as a staging project editor and upload a text PDF, a scanned
   PDF, a mixed PDF, an email and Excel/CSV. Azure returns the existing `proxy`
   upload plan; the browser sends bytes to the authenticated API. Configure every
   proxy/Next gateway's body-size and timeout policy for the intended file sizes;
   direct S3 limits do not prove the Azure proxy accepts a 512 MB upload.
5. The API streams the original to disk, persists it to Blob, then registers
   storage/identity and queues indexing. Failed Blob persistence returns a failed
   upload before registration/accounting. Existing duplicate handling remains;
   do not count a skipped duplicate as proof of a new upload.
   The Next.js multipart proxy also streams the request body; Azure SDK transfer
   blocks/concurrency are bounded. Blob writes run outside the API event loop.
6. Confirm progress reaches indexed/ready, extracted pages are complete, Qdrant
   uses the expected embedding profile and table rows are queryable. Low-quality
   OCR/model errors must remain visible; never hide an error by marking ready.
7. Ask chat and chronology questions whose answers require the scanned page and
   Excel rows. Open the references and verify the correct document, page, table
   and highlight, plus Word/Excel report downloads. Existing OCR text is not
   embedded back into the original PDF: retain original bytes and generated
   viewer anchors/cache behaviour.
8. In staging only, evict one **recoverable cached copy** of a known original
   after confirming its Blob hash; retain the registry/canonical metadata. Open
   its citation again and prove a cold Blob download works after restart. Never
   delete the only original to simulate this check.
9. Repeat with a second project using the same filename. Verify that guessed
   document IDs, names, page anchors, raw-file URLs and user roles cannot read
   another project's document. Blob itself is an infrastructure store: the API
   remains the tenant authorization boundary. No public Blob URL is returned.

Do not re-OCR/re-embed every original merely because the hosting provider changes.
Reprocess only identified missing/invalid derivatives, in the correct project,
with comparison of page count, canonical spans and report quality before replacing
the old derivative.

## 7. Preserve account creation and management

1. Restore source user IDs, password hashes/auth-provider mappings, memberships,
   roles, MFA state, demo/invitation records, subscriptions and ledgers together.
   Blob storage contains document objects, not the application account database.
2. Preserve JWT/session signing and the intended auth provider. Update allowed
   origins, cookie domains, redirect URLs, email verification/reset links and
   provider callbacks for the staging/production hostnames deliberately.
3. Test a new staging signup, verification/reset, demo request, invite acceptance,
   editor/viewer/admin role changes and project creation. Use the existing safe
   mail/payment test modes; confirm token/storage debits occur exactly once.
4. A customer who signs up during the first bulk copy still writes to the source
   authoritative relational store. That signup, its new project/documents and
   ledger entries must be included in the final consistent delta. Copying only
   Blob files does not carry the account across.
5. During the final write freeze, pause signups/uploads/role changes/report jobs
   and drain or record jobs and provider events. After switching, accept new
   writes only on the Azure authority. Never run both sides as independent
   writable account databases.

## 8. Rehearse and perform the production cutover

1. Complete the acceptance checklist below on an isolated restore. Confirm the
   exact image commit, source baseline and target configuration as one release.
2. Rehearse rollback before production. Capture DB/Qdrant restore points,
   source images/configuration and object inventory. Record RPO/RTO and owners.
3. Schedule a maintenance window; lower DNS TTL in advance if using a DNS switch.
   Keep the same production hostnames where possible to avoid unnecessary auth
   and webhook changes. Prepare trusted TLS before traffic moves.
4. Freeze source writes and background producers, drain/record jobs, produce the
   final consistent DB/vector/files delta and reconcile it. A live filesystem
   recopy while jobs/accounts change is not a consistent final delta.
5. Start only the Azure authority, verify private services, then switch the
   reviewed proxy/load-balancer/DNS route. Verify from an external browser as
   well as the VM. Keep source workers stopped so they cannot modify shared
   databases, run duplicate billing or requeue Azure jobs.
6. Recheck login/roles, new signup, upload -> Blob -> OCR -> retrieval -> source
   viewer, chat streaming, chronology/toolkit and report download. Compare queue
   depth/errors, cold/warm latency, peak RAM, disk growth and ledger totals with
   the recorded source baseline under the same corpus/questions.
7. Keep the source recoverable and read-only for the agreed observation period.
   If rollback is needed after Azure accepts writes, pause Azure and reconcile
   new accounts/files/jobs/ledgers first. A DNS-only rollback would lose or split
   those writes. Replay provider events only through qualified idempotent paths.
8. Retire source resources/credentials only after acceptance, retention and a
   tested backup restore. This branch does not perform those operations.

## Acceptance record required before go-live

Record pass/fail, evidence location, source/target commit and responsible owner
for each item; leave unexecuted checks pending:

- Azure container runtime identity/RBAC, private DNS and TLS/ports.
- Consistent relational, local state and Qdrant restore, counts and identifiers.
- Every registered original/canonical key reconciled; remote checksum evidence.
- Correct same-name/two-project isolation and role restrictions.
- Fresh signup/demo/invite/reset and final-delta account preservation.
- New upload, failed upload, duplicate, OCR page coverage and queryable tables.
- Chat/chronology/toolkit quality and stage/stream behaviour on equal evidence.
- Cold source opening, correct page/highlight and DOCX/XLSX downloads.
- Exactly-once storage/token/payment accounting and provider test contracts.
- Interrupted jobs, cold restart, measured latency/RAM and reconciled rollback.

## Official references

- [Create an Azure Storage account](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-create)
- [Secure Azure Storage](https://learn.microsoft.com/en-us/azure/storage/common/secure-storage)
- [Blob Python credentials and data roles](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-python)
- [Storage private endpoints](https://learn.microsoft.com/en-us/azure/storage/common/storage-private-endpoints)
- [S3 to Blob with AzCopy](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azcopy-s3)
- [BlobClient download and conditional ETag contracts](https://learn.microsoft.com/python/api/azure-storage-blob/azure.storage.blob.blobclient)

# Azure migration status

Last updated: 2026-11-06. Azure demo application qualification passed;
AWS retirement and production Coair domain cutover are **not complete**.

## Current application validation

The original AWS/RAG corpus is available through the Coair UI at
https://coair-azure-kadirsen.westeurope.cloudapp.azure.com. Separate live Coair
VPS users, payment records, OTP configuration and domains remain excluded.

- Qualified application baseline: `fd80252` (CI run `42109548171`).
  Full CI passed 847 API tests, 180 frontend tests, four PostgreSQL adapter
  checks and 60 Azure deployment checks. One API check was skipped; 13
  parameterized subtests passed. The focused qualification set passed 201 tests.
- The owner approved an Azure-only demo token limit of 3,000,000. Historical
  usage and financial records were unchanged by that adjustment; subsequent
  validation requests consume normal usage. Admin2 remains unlimited.
- Real demo chatbot validation: a named workbook answer completed in 21.218s
  (104 answer deltas); a selected PDF answer completed in 26.355s (38 deltas).
  These are single observations, not a throughput benchmark.
- The workbook answer retained 53 listed rows, including an unnumbered Q2 row
  and pre-filled entries with missing descriptions. It must not be described
  as 53 complete/distinct notices. The original summary sheet states 41;
  the difference requires source interpretation. Interactive filtering retained
  the correct Q2 row and restored all 53 rows when cleared. Real answer export
  produced a 53-row / five-column Excel workbook and a native Word table.
- Source viewing now reads the original workbook rather than the incomplete
  five-row SQL import. The final patch adds bounded 50-row navigation and
  preserves the actual sheet name. Browser navigation from rows 1–50 to 51–73
  passed, with Next disabled on the last window and Previous enabled.
- Real chronology runs completed with 23 entries / 17 evidence items in 85s
  and 56 entries / 53 evidence items in 329s. Both explicitly report partial
  coverage; zero unresolved source IDs were found. This does not certify that
  every relevant event in the corpus was discovered.
- Narrative Word exports contain 59 and 106 real footnote references. Each
  table-format export contains seven native Word tables (inline source format).
- Native forensic routes were enabled only on Azure after role/project guard
  checks. Real DCMA and report-assembler jobs completed; JSON, Excel and Word
  exports opened as valid files.
- Raster-only PDF upload, OCR, private Blob cold recovery with equal SHA-256,
  authenticated source preview and denial from a foreign project passed.
- Two new project-scoped conversations were restored from private Blob into a
  temporary directory with equal SHA-256; existing user history was untouched.
- Concurrent graph calls reproduced a shared DuckDB result/connection hazard.
  Independent cursors and locked singleton creation passed deterministic
  two-thread isolation tests. No project scope or retrieval limit was removed.
- A fresh post-release timeline chatbot request completed in 55.236s with nine
  citations, ten activity events and 15 answer deltas. It included a cold lexical
  index build; this is a single observation, not a latency guarantee.
- A 1,830,313,391-byte consistent mutable-state checkpoint includes storage,
  project uploads and Qdrant snapshots. The API was paused for 116s and resumed.
  The archive was read fully, restored users/report SQLite databases passed
  integrity checks, and the private Blob copy matched the full remote SHA-256
  `9fb7d9e86a589310cc59088b8c12e55ebd0440c188f8e4e7d5eca747c1cfb62b`.
  Reproducible local archive/vector snapshot copies were then removed.
- Chronology V2 remains configured. The V3 explicit-source fix is tested but its
  rollout flag remains disabled; no unqualified pipeline switch was made.

Private execution evidence is retained on the VM under
`/srv/coair/storage/migrations/azure/acceptance`. Source content, account
credentials and provider keys are not included in this repository.

## Original migration baseline

- Approved region: West Europe, Netherlands. Germany West Central's Basv2
  quota request failed with ContactSupport; its unused initial resources are
  being removed. West Europe approved two Basv2 vCPUs.
- Target resource group: `rg-coair-prod-weu`; VM: `vm-coair`.
- Size: `Standard_B2als_v2`, x64 Ubuntu 24.04 LTS Gen2, 64-GiB Standard SSD LRS.
- Hostname: `coair-azure-kadirsen.westeurope.cloudapp.azure.com`.
- Infrastructure deployment `coair-bootstrap` passed ARM validation and completed
  successfully, including the private Blob container and VM identity data role.
- Blob: `coairkadirsenweuf6cff027`, private container `coair`; shared-key and
  anonymous access disabled, selected-subnet firewall with no bypass.
- Public ports: HTTP/HTTPS; SSH restricted to the administrator source CIDR.
  The temporary AWS migration rule, transfer account and transfer keys were
  removed after verification. Transferred files now belong to the persistent
  operator. API/Qdrant ports are not publicly published.
- `AZURE_PUBLIC_ORIGIN` is configured. The qualified image pair is recorded in
  `/opt/coair-azure/release.json` and exact VM/origin acceptance in `target.json`.
  Automatic releases are enabled only for `codex/azure-migration-preparation`.
  GitHub Actions checks the target VM and public origin, releases the tested
  image pair, and requires the public health revision to match. Per-push delivery
  results are available in the integration workflow's `deploy_azure` job.
  The initial OIDC name-only subject was corrected to the exact ID-bearing
  assertion recorded in [continuous deployment](CONTINUOUS_DEPLOYMENT.md).
- AWS remains authoritative and unchanged. No migration completion or equal
  report quality is implied by successful resource creation.

The actual RAG source has approximately 17 GiB originals and 1.9 GiB application
state, eight users, seven projects, 577 billing-ledger rows, 44 report jobs and
four ingestion jobs at the read-only baseline. The separate Coair staging
fixture is much smaller and must not be substituted for that source corpus.
Final counts must be recaptured at the consistent cutover checkpoint.

Verified so far:

- TLS certificate, Ubuntu Docker/Compose and 2-GiB swap are installed.
- All 7,664 original files match AWS byte-for-byte: 17,866,632,994 bytes,
  tree SHA-256 `2dbed6ba2e68d357057b9247895e2f5cc3edf5c7248b8c3a3a6d616d9a731039`.
- Thirteen SQLite/DuckDB database files and their journals were checkpointed
  together while the source API was paused for 20.5 seconds, then resumed.
- Qdrant restored `coair` (156,218 points) and `coair_events` (0 points), with
  matching vector configurations. No re-embedding was performed.
- All 8,085 planned Blob objects passed a remote-byte SHA-256 comparison.
- Raster PDF OCR, private Blob upload/cold download, hash comparison and OCR
  on the downloaded scan passed on the real VM identity.
- A legacy ledger initialization-order defect was fixed; the existing users,
  accounts, storage ledger and 577 original billing events were preserved.
- Large-corpus BM25 scalar-macro expansion caused severe paging on the 4-GiB
  VM. A bulk scoped query matched the extension's reference scores in tests;
  the actual 135,451-chunk corpus returned 30 complete-text hits in 0.781s in
  a 768-MiB test container with a 512-MB DuckDB budget. This is retrieval
  latency, not full chatbot/report latency. No document coverage was reduced.
- The original demo password passed browser sign-in and MFA. A timeout consumed
  the first MFA challenge; a fresh challenge completed successfully.
- One active standalone account (`demo`) was mapped to its own organization
  as a member. Source project visibility, platform role, token limit and billing
  records were asserted unchanged. Existing module permissions were mapped to
  the company-grant model; users were not grouped across customers.
- The demo's original quota was exhausted. The owner approved the Azure-only
  increase documented above; historical usage/financial data was not reset.
- The separate `login.coair.ai` users, email/OTP and production VPS were explicitly
  excluded by the owner. They have not been merged into this dataset.

Remaining boundaries: production load testing, full-corpus report completeness review and final AWS
write freeze/delta reconciliation/retirement. No production Coair domain was
redirected, and the AWS source remains available. New Azure usage and QA records
must not be overwritten by replaying the old AWS snapshot. Image rollback is
covered by release-guard tests; restoring data is a separate controlled operation.

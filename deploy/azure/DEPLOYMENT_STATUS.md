# Azure migration status

Last updated: 2026-11-05. Application cutover is **not complete**.

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
- Public ports: HTTP/HTTPS; SSH restricted to exact administrator and temporary
  AWS migration source CIDRs. API/Qdrant ports are not publicly published.
- `AZURE_PUBLIC_ORIGIN` is configured. Automatic Azure releases remain disabled
  until full restore/application acceptance and the management route pass.
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
- The demo's original quota is exhausted. Increasing it is awaiting the owner's
  decision; existing usage/financial history has not been reset.
- The separate `login.coair.ai` users, email/OTP and production VPS were explicitly
  excluded by the owner. They have not been merged into this dataset.

Pending: deployment of the fully qualified final image pair, real chatbot/
chronology/forensic and source/Word/Excel acceptance, post-fix 4-GiB workload
measurements, rollback and exact-branch OIDC release qualification, and cutover.
AWS remains authoritative until those checks pass.

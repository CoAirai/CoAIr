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

Pending: host runtime/TLS, complete consistent state and vector restore,
Blob byte verification, real cloud-provider configuration, tenant/source/OCR/
report acceptance, 4-GiB load measurements, rollback qualification and CI route.

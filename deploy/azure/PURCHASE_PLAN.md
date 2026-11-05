# Coair Azure account and purchasing plan

Prepared 2026-11-05. This is a proposed configuration and an estimate, not a
purchase, subscription-specific quote or guarantee of capacity. No Azure
resource, subscription, role assignment or payment was created.

## What was actually checked

- The Azure portal opened under the university tenant. Its home displayed the
  subscription onboarding options. The subscription list, billing permissions,
  VM quota and resource inventory were **not verified**: subsequent portal UI
  access stopped responding. Do not infer that the university or future company
  subscription has the required capacity or permissions.
- The user will use a separate company account for production; the university
  session is only a reference. No customer documents were uploaded there.
- Read-only AWS inspection found approximately 17 GiB originals, 1.9 GiB app
  storage and 1.3 GiB Qdrant data in the selected RAG installation. The small
  Coair integration installation is a different test dataset, not a substitute.
- The source API used about 1.3 GiB RAM and its Qdrant about 126 MiB in one idle
  sample. This is **not peak OCR/report memory** or a load benchmark. VM sizing
  below includes headroom but still needs representative concurrent-load QA.
- The Blob/OCR changes at commit `6e23590` completed the full GitHub workflow:
  API checks, local OCR, PostgreSQL adapter checks and web build/tests succeeded.
- Microsoft public retail prices were retrieved for Germany West Central.
  [procurement-prices.json](procurement-prices.json) records exact meters,
  quantities, timestamps and source URLs. Company contract prices are pending.

## 1. Account and subscription to obtain

1. Use a company-owned **Microsoft Entra workforce tenant** and named work
   accounts. Reuse the company's existing tenant if suitable; do not create
   another directory unnecessarily. Azure infrastructure identities and Coair
   customer accounts remain separate.
2. Obtain a commercial Azure subscription billed to the company: Pay-As-You-Go
   under its billing agreement or the company's existing CSP/MCA arrangement.
   Record legal entity, billing country, tax details, finance owner, recovery
   owner and the currency displayed by that agreement. Complete payment and
   contract acceptance as the authorized company owner.
3. A Microsoft 365 subscription, Entra P1/P2, Azure OpenAI or an Azure SQL
   subscription is not a prerequisite just to host this VM + private Blob setup.
   Follow the company's identity/security policy if it requires extra licenses.
4. Enable MFA and company recovery arrangements. Avoid a university/student
   account as the owner of production resources, customer data or billing.
5. Create a monthly cost budget with actual and forecast notifications; for this
   configuration start planning around USD 250–300 for base infrastructure plus
   a modest operational allowance. **A budget alert does not stop spending.**
   LLM calls, traffic, backup growth and taxes require their own allowance.
6. Obtain the exact tenant ID and subscription ID. Do not purchase resources
   until both are verified in the intended company directory.

### Permissions to arrange

| Identity | Required responsibility | Proposed scope |
| --- | --- | --- |
| Company billing owner | Activate subscription, payment, budget and invoices | Company billing account/subscription |
| Tenant administrator | Workforce accounts, MFA/recovery and identity policy | Company Entra tenant |
| Bootstrap subscription owner or authorized RBAC administrator | Resource setup and approved role assignments | Intended subscription or delegated resource groups |
| Deployment operator | Create/update approved resources | Contributor on Coair resource groups; separate approved role-assignment authority when needed |
| API VM managed identity | Read/write/delete application Blob objects | Storage Blob Data Contributor on its own container |
| Migration operator | Read source and copy/verify target objects | Separate scoped AWS read access and Azure target data access |
| Web-only VM | Reach the private API and pull its image | No document Blob role or API/database secrets |

Billing ownership, Entra Global Administrator, Azure resource ownership and Blob
data access are different permissions. A control-plane Contributor role alone
does not authorize the application's Blob data requests. Do not grant customer
Coair users infrastructure access to implement their application roles.

## 2. Initial resources and monthly estimate

Use Germany West Central as a **provisional** region to keep the existing
Frankfurt-hosted AWS workload geographically close. The customer must approve
data residency. If UK hosting is required, choose an approved UK region and
recheck prices, quota and SKU availability there before provisioning.

All estimates below use Linux Pay-As-You-Go, USD retail, 730 hours/month, no
reservation/Spot/Windows license and one VM. Do not add the optional test VM to
the total unless it will actually run.

| Resource | Initial selection | Monthly base estimate USD |
| --- | --- | ---: |
| Authoritative application VM | `Standard_D4as_v5`, 4 vCPU, 16 GiB, Ubuntu 24.04 LTS x64/Gen2 | 151.84 |
| OS disk | 128 GiB Standard SSD LRS, E10 | 9.60 |
| Persistent application/data disk | 256 GiB Premium SSD LRS, P15; non-shared, separate from OS | 41.81 |
| Blob objects | StorageV2, flat namespace, Hot LRS, 100 GB **usage assumption** | 1.96 |
| Public ingress/explicit egress IP | One Standard static IPv4 attached to the VM NIC | 3.65 |
| Blob private endpoint | One Standard private endpoint | 7.30 |
| Blob private DNS | One private zone linked to the VNet | 0.50 |
| **Base subtotal** | **One initial target VM** | **216.66** |

The 100 GB Blob figure is an estimate of consumption, not a prepaid storage
package or a required minimum allocation. Separate containers in one account do
not each require another private endpoint; separate accounts usually do.

Variable items not included: disk I/O transaction meters, Blob read/write
operations, Private Link data processing, DNS queries, internet/inter-region
egress, snapshots/backups, log ingestion/alerts, paid security/support services,
model/embedding calls, source AWS egress, exchange rates and taxes. Retained
versions and soft-deleted objects count toward storage consumption.

The Premium disk estimate is for an ordinary non-shared disk, not the additional
shared-disk mount meter. Source databases/Qdrant stay on a mounted persistent
managed disk; putting originals in Blob does not move a live SQLite/DuckDB file
into a distributed database.

### How many VMs to buy initially

Start with **one D4as_v5 Azure target**, while AWS remains the production
authority. Use an isolated target dataset, staging hostname and provider test
modes for the migration rehearsal. After acceptance, restore the final source
delta into the separate production state root/container and qualify the
production hostname/image configuration before traffic cutover.

For ongoing independent staging, an **optional** `Standard_D2as_v5` (2 vCPU,
8 GiB) has a retail compute estimate of USD 75.92/month if always running. A
256 GiB E15 Standard SSD adds USD 19.20/month plus transactions; OS/IP/private
networking may add costs too. This smaller VM is not qualified for equivalent
concurrent OCR/report load. Schedule/deallocate it when unused; disks, public
IPs, private endpoints, DNS and retained backups can continue billing.

Multiple stateless web hosts can be added later. Do not purchase several API
VMs expecting local queues/databases to synchronize automatically. This release
deliberately permits only one authoritative stateful API owner.

## 3. Resource layout and creation order

Use company naming rules and mandatory tags; example names are proposals, not
existing resources:

1. Resource groups: `rg-coair-prod-<region>`, and a separate staging group when
   independently operated. Tags: Application, Environment, Owner, CostCenter,
   DataClassification. Check policy before selecting names or region.
2. VNet/subnets with non-overlapping address ranges. Reserve separate application
   and private-endpoint subnets; preserve room for future web hosts.
3. Network security group and one Standard static public IP. Public ingress:
   HTTPS 443; HTTP 80 only if the chosen TLS/redirect method needs it. SSH 22 only
   from the approved administrator IP/VPN. API 8000, Qdrant 6333 and toolkit 8501
   remain private. Default Docker ports are not public customer endpoints.
4. Explicit outbound connectivity: the initial VM's attached Standard public IP
   provides an explicit method. New private-only hosts will need an approved
   NAT Gateway/firewall/other egress method and an updated cost estimate. Do not
   assume Azure assigns usable default internet egress on a new subnet.
5. The x64 Ubuntu VM with the chosen supported security profile and its separate
   persistent data disk, mounted by UUID. Preserve `/app/data` and `/app/storage`
   container paths. Avoid temporary/ephemeral disk for application state.
6. StorageV2 account, private containers, HTTPS/TLS policy, private endpoint and
   private DNS zone `privatelink.blob.core.windows.net` linked to the VNet. The
   app still uses `https://<account>.blob.core.windows.net`; verify its private
   resolution **inside the API container**.
7. Enable managed identity and approve container-scoped Blob data access. The
   browser uploads to the authenticated API, not directly to a public Blob/SAS
   endpoint. Never solve a 403 by allowing anonymous access.
8. Configure the qualified reverse proxy/TLS, source host routing and safe
   monitoring/backup retention. Review optional paid checkboxes against policy
   and the budget before enabling them.
9. Authenticate image pulls from the existing GHCR registry with the approved
   package access mechanism. Azure managed identity does not itself grant GHCR
   package access. ACR is an optional later choice, not a required extra purchase.
10. Apply the protected target configuration and qualified immutable image pair.
    The web image's build-time origins/cookie/redirect and portal hostname layout
    must match the real target. Do not reuse a staging-origin image for production
    solely by changing runtime environment variables.

## 4. Do not purchase these by default

- GPU VM or local-LLM hosting: the chosen Azure path preserves cloud inference;
  the DGX local-model deployment remains separate.
- Azure AI Document Intelligence: existing OCR is local Tesseract. Changing OCR
  providers is a separate quality, schema, latency and billing qualification.
- Azure OpenAI/Azure AI Search: neither replaces the currently qualified model,
  Qdrant, graph, glossary or SQL layers without an explicit migration.
- AKS, multiple API replicas or an expensive public load-balancer tier for the
  current single-authority VM deployment.
- Azure SQL Database/Cosmos DB as a substitute for the existing SQL adapter.
  If a production PostgreSQL service must also move, qualify Azure Database for
  PostgreSQL Flexible Server and quote it separately. Preserve SQL dialect,
  extensions, Supabase auth/provider contracts, IDs, roles and billing behaviour.
- Separate database/S3 licenses: the source application's existing configuration
  determines what remains external. Hosting on Azure does not automatically move
  Supabase, Stripe, mail or cloud inference providers into Azure.
- Azure Files/shared disk as an automatic solution to multiple SQLite/DuckDB
  writers. It does not provide the application's missing job ownership/fencing.
- A long reservation/savings commitment before the real workload and stable
  target SKU have been measured. Keep initial purchasing reversible.

Existing enterprise policy may require additional services. Review that policy
before treating any item as optional or changing a mandated protection.

## 5. Checks immediately after receiving the company account

Install the official Azure CLI on the operator machine if needed. Complete
company sign-in normally, then run the read-only checker with explicit IDs:

```sh
az login --tenant <company-tenant-id>
python3 deploy/azure/account_check.py \
  --tenant <company-tenant-id> --subscription <company-subscription-id> \
  --region germanywestcentral --vm-size Standard_D4as_v5 --vm-count 1
```

If a specific zone is required, include `--zone <zone-number>`. If two identical
VMs are planned, set `--vm-count 2` to check both together. Different VM sizes
and other planned resources need an aggregate quota calculation too.

The checker never changes the selected CLI account. It reads account state,
Compute/Network/Storage provider registration, the exact SKU's restrictions and
both regional and per-family vCPU quotas. It blocks a university/company tenant
mismatch, missing quota data and missing providers. It does not create resources,
register providers, request quota, assign roles or certify policy/RBAC/capacity.

Complete the following account-specific gates before provisioning:

| Gate | Required evidence | Who resolves it |
| --- | --- | --- |
| Billing activation | Correct commercial subscription is Enabled and payment/credit policy permits the planned resources | Company billing owner |
| Tenant/subscription | Both expected IDs match the intended company context | Owner/operator |
| Creation/RBAC | Effective permission to deploy and to approve intended role assignments | Subscription/RBAC administrator |
| Providers | Compute, Network and Storage registered; enable additional selected services deliberately | Authorized subscription operator |
| Region/policy | Data residency, allowed regions/SKUs, mandatory tags, permitted public IP and private endpoint policy | Customer/tenant governance owner |
| vCPU quota | At least four **available** regional and Dasv5-family vCPUs for this VM; include all simultaneous hosts | Subscription operator |
| VM capacity | Selected SKU/zone can actually allocate; a public price or sufficient quota is not a capacity reservation | Deployment operator/Azure support |
| Storage name | Proposed globally unique storage account name is available | Operator |
| DNS/TLS | Control over the production/staging DNS zone and ability to issue/renew TLS | Domain owner |
| Image pulls | GHCR access from the target and matching tested API/web commit | Deployment operator |
| Runtime network | Private Blob DNS, managed identity, outbound HTTPS, model/mail/database endpoints | Network/operator |

If the initial SKU lacks capacity, evaluate the documented D4s_v5 x64 alternative
or another approved region and reprice/retest it. Do not switch silently to ARM,
Spot, another jurisdiction or a smaller RAM tier to make a deployment succeed.

## 6. Information to have ready before migration day

- Company tenant/subscription, authorized operators, billing owner and governance
  requirements; no passwords or private keys in this repository.
- Approved region, VM/zone decision and exact current subscription quote.
- Source application installation, consistent DB/queue/catalog/registry backup,
  Qdrant snapshot and original/canonical asset inventories. Resolve legacy
  project mappings and files present only in S3.
- Source model/embedding/vector dimensions, prompts, graph/glossary state and
  OCR configuration. Source environment inspection did not set explicit OCR
  overrides; read the selected image's effective defaults and compare coverage.
  The current branch defaults to 500 OCR pages; test the actual longest files.
- Actual production auth/JWT, user/organization/project IDs, mail, payment,
  subscription and token ledger configuration. Do not substitute test settings.
- Real source bucket name for the explicit legacy canonical URI mapping.
- Chosen hostnames and build-time origin configuration; current DNS values and
  rollback routing; toolkit image/session configuration if used.
- Test identities and provider test modes; safe fixtures for native/scanned/mixed
  PDF, email, Excel, same-name cross-project access and long reports.
- Maintenance owner, write-freeze window, handling of in-flight jobs/provider
  events, expected downtime/data-loss objectives and post-cutover write rollback.

## 7. Conditions before calling the move complete

Follow [MIGRATION_RUNBOOK.md](MIGRATION_RUNBOOK.md). Require a complete consistent
restore and remote-byte verification, plus new upload -> Blob -> OCR -> query ->
source opening with cold cache; roles/signup/demo/payment/token checks; streaming,
Word/Excel downloads and equal-corpus report quality; restart/job recovery; and
a rehearsed rollback that reconciles writes made after Azure becomes authority.

No purchasing plan can guarantee that a new subscription's policy, quotas or
physical capacity will be immediately available. The point of the gates is to
find those blockers before the production maintenance window.

## Sources and price refresh

Refresh the exact public meter queries in `procurement-prices.json` and review
the actual subscription quote before creating resources. Public USD list prices
are not the company invoice or a promise that exchange rates/taxes stay fixed.

- [Microsoft retail pricing API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
- [Dasv5 machine specifications](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/dasv5-series)
- [Managed disk types and billing](https://learn.microsoft.com/en-us/azure/virtual-machines/disks-types)
- [Azure VM quota and capacity distinctions](https://learn.microsoft.com/en-us/azure/virtual-machines/quotas)
- [Create a commercial subscription](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/create-subscription)
- [Explicit outbound connectivity](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/default-outbound-access)
- [Private Link pricing](https://azure.microsoft.com/en-us/pricing/details/private-link/)
- [Private DNS pricing](https://azure.microsoft.com/en-us/pricing/details/dns/)

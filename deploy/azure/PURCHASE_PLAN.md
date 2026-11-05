# Coair Azure account and purchasing plan

Prepared 2026-11-05. This is a proposed configuration and an estimate, not a
purchase, subscription-specific quote or guarantee of capacity. No Azure
resource, subscription, role assignment or payment was created.

## What was actually checked

- The Azure portal opened under the university tenant. Its home displayed the
  subscription onboarding options. The subscription list, billing permissions,
  VM quota and resource inventory were **not verified**: subsequent portal UI
  access stopped responding. Do not infer that the university or future personally owned
  subscription has the required capacity or permissions.
- Current scope: a personally owned paid Azure demo for sales demonstrations;
  incorporation and a company-owned account are not prerequisites for this phase.
  The university session is only a reference. No customer documents were uploaded there.
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
  quantities, timestamps and source URLs. The actual subscription quote is pending.

## 1. Account and subscription to obtain

1. Use a Microsoft account you personally control and a normal **Pay-As-You-Go**
   Azure subscription for the demonstration. No incorporated company, separate
   Microsoft 365 purchase or corporate workforce directory is required for the
   selected deployment. Azure still associates the subscription with an Entra
   directory; record that actual tenant instead of creating redundant directories.
2. Set the billing profile country to **Türkiye** when that matches the real card
   billing address. Use your own accurate name, address and contact information.
   The owner completes card verification and agreement acceptance directly.
3. Use the normal paid subscription for ongoing sales demos. An eligible free
   trial can be useful for initial experiments, but trial eligibility, credit,
   quota and expiration must not become a dependency of a scheduled sales meeting.
4. Enable MFA and recovery on the owner account. Keep the university-managed
   sign-in separate from ownership of the long-term paid demo subscription.
5. Create a monthly budget with actual/forecast alerts. With the selected 4 GiB
   VM always running, the base estimate is USD 40.38/month; plan an additional
   operational allowance for variable traffic, backup/logging, model usage and
   taxes. **A budget alert does not stop spending.**
6. Record and verify the personally owned subscription's exact tenant ID and
   subscription ID before provisioning. Existing Coair user/demo/project roles
   remain in the application; they do not require Azure user licenses.

### Permissions to arrange

| Identity | Required responsibility | Proposed scope |
| --- | --- | --- |
| Personal subscription owner | Activate subscription, payment, budget and invoices | Personally owned billing account/subscription |
| Subscription/directory owner | Owner sign-in, MFA/recovery and any delegated operators | Selected subscription/directory |
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

The user approved **West Europe (Netherlands)** on 2026-11-05 after Germany
West Central rejected the required Basv2-family quota request. West Europe
approved two family vCPUs and the initial VM deployment succeeded. The four
selected retail meters were rechecked in West Europe at the same prices below.
Any subsequent change in data residency still requires an explicit decision.

The budget target is **one Standard_B2als_v2: 2 vCPU, 4 GiB RAM, x64**.
This replaces the earlier 16 GiB fixed-performance/Premium-disk proposal. The
user prioritizes a low-cost sales demo comparable to the previous small AWS tier.

All estimates below use Linux Pay-As-You-Go, West Europe, USD retail,
730 hours/month, no reservation/Spot/Windows license and one VM:

| Resource | Budget selection | Monthly base estimate USD |
| --- | --- | ---: |
| Application VM | `Standard_B2als_v2`, 2 vCPU, 4 GiB, Ubuntu 24.04 LTS x64/Gen2 | 31.54 |
| Persistent OS/application disk | 64 GiB Standard SSD LRS, E6; non-ephemeral | 4.80 |
| Blob objects | StorageV2, flat namespace, Hot LRS, 20 GB usage assumption | 0.39 |
| Public ingress/explicit egress IP | One Standard static IPv4 attached to the VM NIC | 3.65 |
| Blob subnet service endpoint | `Microsoft.Storage`, selected-subnet/default-deny firewall | No additional endpoint charge |
| Separate data disk / Private Endpoint / private DNS zone | Not selected for the initial budget demo | 0.00 |
| **Base subtotal** | **Single 4 GiB demo VM** | **40.38** |

The 20 GB Blob figure is an estimate of consumption, not a prepaid storage
package. Increasing storage consumption to 100 GB makes this base approximately
USD 41.95/month, before variable charges. Source API/web/toolkit images observed
on AWS total approximately 1.6 GB; the approximately 20 GB application dataset,
OS, images and temporary processing need a measured free-space budget on 64 GiB.
Do not copy the whole 90 GiB shared AWS root into this smaller target.

Variable items not included: disk transactions, Blob operations, DNS/traffic
charges where applicable, internet/inter-region egress, snapshots/backups, logs,
optional paid services, model/embedding calls, AWS source egress, FX and taxes.
The retail API later rate-limited refresh requests; the price record preserves
successful observations from the same day/session. Recheck the subscription
quote before purchasing.

### What changed from the expensive estimate

- A 4 GiB burstable B-series replaces the 16 GiB D-series VM.
- One persistent 64 GiB Standard SSD hosts OS and application state. The existing
  `/srv/coair` bind mounts remain persistent; no extra Premium data disk is needed.
- Blob uses an authenticated, selected-subnet service endpoint/firewall path.
  A paid Private Endpoint and private DNS zone are optional alternatives.
- One VM hosts API, Qdrant, web and the existing toolkit when required. No new
  paid database, search cluster, GPU, registry or public load balancer is assumed.

Do not make Blob anonymous or enable unrestricted network access to save money.
The normal Blob HTTPS endpoint remains public-addressed, but the storage firewall
allows the selected Azure subnet only and the API identity needs its data role.
Service endpoints are not Private Link: they do not allocate a private Blob IP.

### Demo schedule and 4 GiB qualification

VM compute is approximately USD 0.0432/hour. As an illustration, 40 VM-running
hours/month cost USD 1.73 compute plus approximately USD 8.84 retained disk/IP/
20-GB-Blob base: about USD 10.57/month before variable usage. Deallocate the VM
when unused; shutting down only inside Linux is not the same billing action.
Retained disks/IP/Blob/backups keep billing. Allow startup and warm-up before a
meeting; use images already built by CI rather than building on the small VM.

**4 GiB full-stack performance is not yet qualified.** Validate representative
chat/SQL, chronology, Word/Excel output, source opening and scanned upload/OCR
with the actual corpus. Include the toolkit, warm/cold runs, process RSS, host
free memory, OOM events, swap and Azure CPU credit balance.

Keep ingestion/OCR concurrency at one and avoid simultaneous bulk ingestion,
large reports and multiple demo users until measured. B-series CPU credits can
run out during sustained OCR/indexing; that affects throughput/latency. Do not
silently shorten reports, lower evidence coverage, change embeddings or disable
agents to force the small VM to pass. Off-VM consistent backups and rollback
remain required. Add storage or change size only if measurements justify it.

## AWS baseline and matching Azure selection

The AWS host was rechecked read-only on 2026-11-05:

| Requirement | Current AWS host | Selected Azure target |
| --- | --- | --- |
| CPU | 2 vCPU, Intel Xeon Platinum 8175M | 2 burstable vCPU, `Standard_B2als_v2` |
| RAM | 7,818 MiB reported, approximately 8 GB tier | 4 GiB budget demo target |
| Instruction architecture | x86_64 | x64; do not substitute ARM |
| Host OS | Ubuntu 24.04.4 LTS | Ubuntu 24.04 LTS Gen2 |
| Application Python | 3.11.16 in the source API container | The qualified Python 3.11 API image |
| Current root filesystem | Approximately 154 GiB usable, 90 GiB occupied across several applications | Single 64 GiB persistent OS/application disk |
| RAG data | Approximately 17 GiB originals + 1.9 GiB storage + 1.3 GiB Qdrant | Persistent restored state + private Blob originals/canonical assets |
| API/Qdrant memory limits | No explicit Docker limit; bounded by host memory | No new API/Qdrant Docker RAM cap in this profile |
| Toolkit | Separate container, 2 GiB memory cap, observed approximately 183 MiB idle | Preserve upstream toolkit image and its 2 GiB cap |
| Inference/embeddings | Cloud generation; CPU fastembed and Qdrant | Preserve providers/models/embedding dimensions; no GPU purchase |

The current AWS host has more RAM than the budget Azure target. The 4 GiB
selection follows the user's prior small-AWS experience and demo cost preference;
it is not proof of equal peak concurrency or response time. CPU credit behaviour,
network, disk and process memory differ. Equal-corpus chat/chronology/toolkit,
OCR, report delivery and warm/cold query measurements remain acceptance gates.

The old AWS RAG application is not byte-identical to the Coair integration branch.
The target is the Coair branch with the transferred agent/report improvements;
its complete source corpus and stores must be restored explicitly. Moving only
the three-document Coair staging fixture would not recreate the AWS demo.

Infrastructure differences to qualify are S3 versus Blob authorization/object
keys, Azure private DNS/RBAC, explicit outbound internet, TLS/origin routing and
job/data restore. Cloud account location does not by itself change prompts or
require a different LLM. Current `compose.yml` retains one authoritative API,
Qdrant, web and the optional source toolkit; the network-only web split is optional.

## Türkiye billing, cards and deployment region

- Türkiye is listed as an Azure-supported signup location. Use the real Turkish
  billing profile; **West Europe is the resource location**, not the
  card's billing country. Availability, subscription policy and quota still need
  checking for that selected region.
- Microsoft's current supported-payment table lists Visa, Mastercard and
  American Express for Türkiye. Prefer an ordinary supported credit/debit card;
  Microsoft's signup guidance excludes virtual and prepaid cards.
- Name, billing address and card information must match bank records. Confirm
  the card is active, has sufficient available funds/limit and supports the
  required international online charges. A supported card brand alone cannot
  guarantee that the issuing bank approves the authorization.
- Signup may place a temporary USD 1 or equivalent authorization hold. This is
  separate from recurring Pay-As-You-Go usage charges.
- Microsoft's direct MCA billing-currency table lists Türkiye in USD. Confirm
  the actual offer/account currency shown at signup; inspect the bank's foreign
  currency conversion/fee terms rather than treating the retail estimate as a
  guaranteed TRY debit.
- On a declined payment, first check card type, billing-country/address matching,
  available limit and issuer restrictions, then use Azure billing/signup support.
  Do not change the country to Germany just to match the VM's region, and do not
  use another person's or fabricated billing information to bypass validation.
- No card number, CVV, private identity document, password or OTP belongs in the
  repository or chat. The owner completes those fields at the official Azure site.

## 3. Resource layout and creation order

Use consistent project naming and any subscription-mandated tags; example names are proposals, not
existing resources:

1. Resource groups: `rg-coair-prod-<region>`, and a separate staging group when
   independently operated. Tags: Application, Environment, Owner, CostCenter,
   DataClassification. Check policy before selecting names or region.
2. VNet/subnets with non-overlapping address ranges. Use an application subnet with a Microsoft.Storage service endpoint;
   reserve extra subnet space only for future private endpoints/web hosts.
3. Network security group and one Standard static public IP. Public ingress:
   HTTPS 443; HTTP 80 only if the chosen TLS/redirect method needs it. SSH 22 only
   from the approved administrator IP/VPN. API 8000, Qdrant 6333 and toolkit 8501
   remain private. Default Docker ports are not public customer endpoints.
4. Explicit outbound connectivity: the initial VM's attached Standard public IP
   provides an explicit method. New private-only hosts will need an approved
   NAT Gateway/firewall/other egress method and an updated cost estimate. Do not
   assume Azure assigns usable default internet egress on a new subnet.
5. The x64 Ubuntu VM with a persistent 64 GiB Standard SSD OS disk. Put the
   host application state in `/srv/coair` and preserve `/app/data` and
   `/app/storage` container paths. Keep off-VM backups. No ephemeral disk or
   writable container layer may be the sole application state store.
6. StorageV2 account, private containers and HTTPS/TLS. Enable the application
   subnet's Microsoft.Storage service endpoint, set the storage firewall default
   to Deny and allow that subnet. Public network access is limited to selected
   networks, not Disabled and not All networks. The standard Blob hostname
   resolves normally; verify authorized reads from the API and denial outside
   approved networks. If Private Link is later selected, add its private DNS
   and costs explicitly instead.
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

Existing subscription/directory policy may require additional services. Review that policy
before treating any item as optional or changing a mandated protection.

## 5. Checks immediately after opening the individual subscription

Install the official Azure CLI on the operator machine if needed. Complete
the personally owned account sign-in normally, then run the read-only checker with explicit IDs:

```sh
az login --tenant <target-tenant-id>
python3 deploy/azure/account_check.py \
  --tenant <target-tenant-id> --subscription <target-subscription-id> \
  --region westeurope --vm-size Standard_B2als_v2 --vm-count 1
```

If a specific zone is required, include `--zone <zone-number>`. If two identical
VMs are planned, set `--vm-count 2` to check both together. Different VM sizes
and other planned resources need an aggregate quota calculation too.

The checker never changes the selected CLI account. It reads account state,
Compute/Network/Storage provider registration, the exact SKU's restrictions and
both regional and per-family vCPU quotas. It blocks an unexpected university/target
tenant mismatch, missing quota data and missing providers. It does not create resources,
register providers, request quota, assign roles or certify policy/RBAC/capacity.

Complete the following account-specific gates before provisioning:

| Gate | Required evidence | Who resolves it |
| --- | --- | --- |
| Billing activation | Correct personally owned paid subscription is Enabled and payment/credit policy permits the planned resources | Personal subscription owner |
| Tenant/subscription | Both expected IDs match the intended personally owned context | Owner/operator |
| Creation/RBAC | Effective permission to deploy and to approve intended role assignments | Subscription/RBAC administrator |
| Providers | Compute, Network and Storage registered; enable additional selected services deliberately | Authorized subscription operator |
| Region/policy | Data residency, allowed regions/SKUs, mandatory tags, permitted public IP and private endpoint policy | Account owner/customer when applicable |
| vCPU quota | At least two **available** regional and Basv2-family vCPUs for this VM; include all simultaneous hosts | Subscription operator |
| VM capacity | Selected SKU/zone can actually allocate; a public price or sufficient quota is not a capacity reservation | Deployment operator/Azure support |
| Storage name | Proposed globally unique storage account name is available | Operator |
| DNS/TLS | Control over the production/staging DNS zone and ability to issue/renew TLS | Domain owner |
| Image pulls | GHCR access from the target and matching tested API/web commit | Deployment operator |
| Runtime network | Blob service-endpoint/firewall/identity access, DNS and explicit outbound HTTPS | Network/operator |

If the initial SKU lacks capacity, evaluate another available 4 GiB x64 SKU
or an approved region, and reprice/retest it. Do not switch silently to ARM,
Spot, another jurisdiction or a smaller RAM tier to make a deployment succeed.

## 6. Information to have ready before migration day

- Personally owned target tenant/subscription, authorized operators, billing owner and any governance
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
are not the actual account invoice or a promise that exchange rates/taxes stay fixed.

- [Microsoft retail pricing API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
- [Dasv5 machine specifications](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/dasv5-series)
- [Managed disk types and billing](https://learn.microsoft.com/en-us/azure/virtual-machines/disks-types)
- [Azure VM quota and capacity distinctions](https://learn.microsoft.com/en-us/azure/virtual-machines/quotas)
- [Create a commercial subscription](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/create-subscription)
- [Explicit outbound connectivity](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/default-outbound-access)
- [Private Link pricing](https://azure.microsoft.com/en-us/pricing/details/private-link/)
- [Private DNS pricing](https://azure.microsoft.com/en-us/pricing/details/dns/)

Additional account/payment references checked 2026-11-05:

- [Azure account signup requirements and supported countries](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account)
- [Supported payment methods, including Türkiye](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/supported-payment-methods)
- [Declined cards and virtual/prepaid restrictions](https://learn.microsoft.com/en-us/azure/cost-management-billing/troubleshoot-billing/troubleshoot-declined-card)
- [Signup and address verification](https://learn.microsoft.com/en-us/azure/cost-management-billing/troubleshoot-subscription/troubleshoot-azure-sign-up)
- [Direct MCA billing currencies](https://learn.microsoft.com/en-us/azure/cost-management-billing/microsoft-customer-agreement/microsoft-customer-agreement-faq)

Budget-profile references:

- [B2als_v2 size and CPU credit behaviour](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/basv2-series)
- [Service endpoints have no additional endpoint charge](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq)
- [Selected-subnet Blob firewall access](https://learn.microsoft.com/en-us/azure/storage/common/storage-network-security-virtual-networks)

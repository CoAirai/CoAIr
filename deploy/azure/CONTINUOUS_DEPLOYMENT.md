# Azure branch to demo VM

Target branch: `codex/azure-migration-preparation`. Every push builds and tests
the API/web pair. Only this branch can run the separate Azure deployment job.
The existing AWS deployment conditions remain unchanged. There is no Azure
deployment until the account, VM, restored data and initial acceptance exist.

## Required one-time setup

1. Finish the real Azure signup, card verification and agreement as the account
   owner. The university email can be used as selected by the user; verify its
   actual directory restrictions, subscription permission and quota. Do not
   assume signup or quota succeeded from a filled form.
2. Provision the selected 4-GiB x64 demo VM, persistent disk, subnet/Blob firewall,
   managed identity and HTTPS hostname using PURCHASE_PLAN.md. Install official
   Docker/Compose and Python 3. Build images on GitHub, not on the 4-GiB VM.
3. Set repository variable `AZURE_PUBLIC_ORIGIN` to the exact HTTPS hostname,
   without a trailing slash. Push a commit so the web image is built with that
   origin; API and web images must identify the same tested 40-character commit.
   A build without this variable uses `https://azure.invalid` only for CI and
   cannot pass the Azure release guard.
4. Create `/opt/coair-azure` and `/opt/coair-azure/releases` for the deployment
   operator, plus `/srv/coair/{data,storage,qdrant}` on persistent storage.
   Put protected `.env` and `api.env` in `/opt/coair-azure` with the real source
   identities/providers and Azure Blob settings. Preserve the original source
   installation; do not mount its live directories into the target.
5. Restore and verify originals, databases/queues/registry and Qdrant snapshots.
   Preserve the qualified Qdrant image. Follow MIGRATION_RUNBOOK.md for complete
   tenant/source/report/accounting acceptance, including actual 4-GiB memory/load
   tests. No data restore or schema downgrade is performed by a branch push.
6. Archive `deploy/azure` from the selected tested commit under
   `/opt/coair-azure/releases/<commit>/deploy/azure`. Use its Compose file with
   project directory `/opt/coair-azure`, project name `coair-azure`, `.env` and
   profile `all-in-one` to start the initial stack. The optional source toolkit
   is separately bootstrapped with its profile when required. Public reverse
   proxy terminates TLS; application ports stay on loopback.
7. Prove the public sign-in page and `/coair-api/health` reach this VM. Health
   must return `status=ok` and the selected commit. Keep the immutable previous
   Compose file/images; the deployer uses them for application rollback.
8. Write `/opt/coair-azure/release.json` with the actual qualified pair:

```json
{
  "API_IMAGE": "ghcr.io/coairai/coair-integration-api:<qualified-40-character-commit>",
  "WEB_IMAGE": "ghcr.io/coairai/coair-integration-web:<same-qualified-commit>",
  "public_origin": "https://your-qualified-demo-hostname"
}
```

9. Create protected `/opt/coair-azure/target.json` from `target.example.json`.
   Set the exact VM ID/subscription ID from the real Azure VM, origin and
   qualified Qdrant image. Set `acceptance_complete=true` only after the restore
   and acceptance above. The release script checks Azure's local IMDS response
   before Docker mutations; an AWS/DGX host or wrong Azure VM is rejected.

## GitHub configuration: branch-scoped Azure OIDC

The actual target uses Azure Run Command with a user-assigned managed identity.
No GitHub SSH key, Tailscale OAuth client or internet-wide SSH rule is required.
The existing AWS `integration` environment and deployment job are unchanged.

Repository variables:

| Variable | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | Deployment managed identity client ID |
| `AZURE_TENANT_ID` | Approved Azure tenant |
| `AZURE_SUBSCRIPTION_ID` | Approved Azure subscription |
| `AZURE_VM_RESOURCE_ID` | Exact approved VM resource ID |
| `AZURE_PUBLIC_ORIGIN` | Exact qualified HTTPS application origin |
| `AZURE_DEPLOY_ENABLED` | Set to `true` only after initial acceptance |

Configure a federated credential with issuer
`https://token.actions.githubusercontent.com`, audience
`api://AzureADTokenExchange`, and the exact case-sensitive subject:
`repo:CoAirai@317926083/CoAIr@1339170652:ref:refs/heads/codex/azure-migration-preparation`.
This is the subject actually emitted by this repository's OIDC job. Its stable
owner/repository IDs are significant: the name-only subject rejected the first
login with `AADSTS700213`. Keep an exact branch match; do not use a wildcard or
add another repository/environment to work around an assertion mismatch.
The job deliberately has no GitHub environment so this exact branch subject
is used. It requires `contents: read`, `packages: read`, and `id-token: write`.
No Azure environment was present in this repository; its existing `integration`
environment remains untouched. Creating a new environment requires repository
admin permission, which the current operator does not have. The exact-branch
federation does not require changing repository approval/security settings.

Assign the deployment identity only these actions, scoped to this one VM:
`Microsoft.Compute/virtualMachines/read`,
`Microsoft.Compute/virtualMachines/instanceView/read`, and
`Microsoft.Compute/virtualMachines/runCommand/action`.
It receives no subscription-wide Contributor role and no Blob data role.
The API VM's separate system-assigned identity retains container-scoped Blob
access. Run Command is host execution authority; restrict the identity to the
trusted deployment branch and this VM. It cannot reach AWS or DGX through this
route.

`run_command.py` requires the checkout and image SHAs to match, sends only the
release guard and Compose archive through the Azure control plane, checks VM
identity/acceptance before changing release directories, and runs the normal
release controller as the operator owning `/opt/coair-azure`. The current GHCR
image packages were qualified for anonymous pulls on the target; no registry
credential enters the command payload. Package visibility is not changed here.
The helper requires an explicit success marker plus an independent public
revision/HTML smoke check; Azure agent completion alone is not release success.

Official references:
- https://github.com/Azure/login#login-with-openid-connect-oidc-recommended
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust-user-assigned-managed-identity
- https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/compute

## What each enabled push does

1. Run release-guard, Azure readiness/inventory/storage and cloud boundary tests.
2. Build the immutable API and origin-specific web images; run the existing API,
   account/role/billing, PostgreSQL, OCR and web checks before publishing.
3. Authenticate through the exact-branch Azure identity. Use Run Command on the
   approved VM and run the target/IMDS check before extracting the immutable
   Compose/release bundle. No registry/application credentials are uploaded.
4. Verify target acceptance, Azure VM/subscription identity, matching image
   commits, single API ownership, loopback ports, expected persistent/secret mounts,
   unchanged Qdrant image and web origin/build labels. Serialize deployments.
5. Pull/recreate **API and web only**. Qdrant/toolkit are not restarted/upgraded
   by application pushes, and no customer state is deleted or recopied.
6. Check Compose health, the public sign-in page and the public API's commit.
   A failed activation/smoke rolls back to the previous qualified image pair
   **and its retained Compose file**, then checks the old public commit.
7. Atomically record the healthy release and one previous image/origin record.

Automatic rollback covers application images/Compose, not database changes or
post-cutover business writes. Keep schema changes backward compatible; use an
explicit backed-up maintenance plan for incompatible migrations. Full model
quality/billable report tests are not run automatically on every push.

Disable `AZURE_DEPLOY_ENABLED` to stop subsequent automatic releases during a
maintenance investigation. No DNS switch or AWS shutdown is coupled to pushes.

Do not override `COAIR_COMMIT_SHA` in the server's private `api.env`: it comes
from the qualified API image. An old override makes the public revision check
fail correctly even if the process is otherwise healthy.

# Coair Azure handover — start here

Prepared for Hasnain and the Coair team. Verified 6 November 2026.

**The application is running on Azure.** This branch contains the deployment code,
current resource references and domain-transition instructions. No new Azure VM
or duplicate application database is needed for the first custom-domain rollout.

- Repository: https://github.com/CoAirai/CoAIr
- Working branch: **`codex/azure-migration-preparation`**. Do not merge to or deploy
  production `main` as part of this handover.
- Application: https://coair-azure-kadirsen.westeurope.cloudapp.azure.com
- Public health: https://coair-azure-kadirsen.westeurope.cloudapp.azure.com/coair-api/health
- Verified application/delivery baseline: `75f2c471c6da8844900753c20c60d89656cd345c`.
  Subsequent documentation pushes have different SHAs; the latest successful
  `deploy_azure` job and public health response identify the running release.
- Successful delivery evidence: https://github.com/CoAirai/CoAIr/actions/runs/42112967746
- Shareable Word handover: [COAIR_AZURE_HANDOVER.docx](../../docs/integration/COAIR_AZURE_HANDOVER.docx).

## 1. Access: what Kadir needs to provide

You do **not** need Kadir's Microsoft password, MFA codes, credit card or private
SSH key. Use your own Microsoft identity. The identifiers below locate resources;
they are not login credentials and do not grant access.

**Human access has not been provisioned for Hasnain by this handover.** Send Kadir
the Microsoft-account email you will use. Kadir/the authorized tenant owner must
invite that identity if necessary, assign the agreed resource-scoped access and
have you accept the invitation. A university tenant's external-invitation policy
may require an authorized Entra administrator; subscription access does not imply
permission to bypass that policy.

| Task | Required access / boundary |
| --- | --- |
| Read code and run delivery | CoAirai/CoAIr access to this branch and its Actions. Maintaining Actions variables also requires the appropriate repository permission. |
| Inspect the existing Azure target | Reader on `rg-coair-prod-weu`, or equivalent approved read access. |
| nginx/TLS and application operations through Azure Run Command | Existing custom role **Coair Azure VM Release**, scoped to `vm-coair` only, plus the read access above. Its actions are VM read, instanceView read and runCommand/action. Run Command is root-capable host access; assign only to the approved trusted operator. |
| Domain record | Delegated access to the authoritative DNS zone for `coair.ai`, or ask the DNS owner to add the agreed record. Azure DNS administration is not needed if the zone is hosted elsewhere. |
| Optional direct SSH | A separately approved personal public key/OS access and a restricted source-IP rule. This is not required for the established CI/Run Command route. Do not reuse Kadir's private key or open SSH to all addresses. |

The owner assigns human roles through Azure IAM after identifying the correct
user/guest object. No subscription-wide Owner or Contributor role is required for
this first domain task. The existing CI managed identity is not a shared human
account. Do not add a client secret or copy personal credentials into GitHub.

## 2. Existing Azure target: non-secret reference

| Setting | Actual value |
| --- | --- |
| Tenant ID | `f1a26096-6ac1-45ab-86a3-938aa985bdf5` |
| Subscription ID | `f6cff027-52c3-41db-a7ef-9fd0588b52a3` |
| Resource group | `rg-coair-prod-weu` |
| VM | `vm-coair` — West Europe, Ubuntu x64 |
| VM resource ID | `/subscriptions/f6cff027-52c3-41db-a7ef-9fd0588b52a3/resourceGroups/rg-coair-prod-weu/providers/Microsoft.Compute/virtualMachines/vm-coair` |
| VM instance ID used by the release guard | `9422e9d0-c005-4dc7-b194-9013c67856e0` |
| Compute / disk | `Standard_B2als_v2`, 2 vCPU / 4 GiB; 64-GiB Standard SSD |
| Static public IPv4 | `52.233.224.179` (`pip-coair`) |
| Current HTTPS origin | `https://coair-azure-kadirsen.westeurope.cloudapp.azure.com` |
| Private Blob | Account `coairkadirsenweuf6cff027`, container `coair`, Hot LRS |
| Blob account URL | `https://coairkadirsenweuf6cff027.blob.core.windows.net` |
| Application state | `/srv/coair/data`, `/srv/coair/storage`, `/srv/coair/qdrant` |
| Deployment configuration | `/opt/coair-azure`; immutable bundles under `releases/<commit>/deploy/azure` |
| Current/qualified target records | `/opt/coair-azure/release.json`, `/opt/coair-azure/target.json` |
| CI managed identity | `id-coair-github-deploy`; client ID `08c3bbbd-47bd-43ff-bfdc-a68f047cb92a` |
| CI custom role definition ID | `bee7fbbc-b13a-4d44-aef0-a3d87ab8c345` |

The VM's separate system-assigned identity provides private Blob access. Gemini
API credentials and application/session configuration already exist in protected
server files. Their values are intentionally absent from Git. File references:
`api.env`, `.env`, `provider-keys/` and `toolkit-secrets.toml` under
`/opt/coair-azure`. An authorized operator should preserve them; obtain any
additional production mail/payment credentials through an approved secure
channel, not a commit or this document.

## 3. First checks after access is granted

Use your own Azure and GitHub sessions:

```sh
git fetch origin
git switch codex/azure-migration-preparation
git pull --ff-only origin codex/azure-migration-preparation
az login --tenant f1a26096-6ac1-45ab-86a3-938aa985bdf5
az account set --subscription f6cff027-52c3-41db-a7ef-9fd0588b52a3
az vm show --resource-group rg-coair-prod-weu --name vm-coair \
  --query '{id:id,location:location,size:hardwareProfile.vmSize}' --output json
curl -fsS https://coair-azure-kadirsen.westeurope.cloudapp.azure.com/coair-api/health
```

If the branch is not local yet, create a tracking branch from its existing remote
ref. Do not create a new branch from production main or re-provision this target.

[CONTINUOUS_DEPLOYMENT.md](CONTINUOUS_DEPLOYMENT.md) contains the existing OIDC
subject, least-privilege actions, repository variables and guarded release route.
Current `AZURE_DEPLOY_ENABLED=true`; pushes can deploy this environment. The job
checks VM identity, origin, image-pair SHA, private service exposure and public
health. It does not migrate live customer databases or change DNS.

## 4. Requested domain work

Recommended first hostname: **`azure.coair.ai`**, subject to the owner's agreement.

```text
Type: A
Name: azure
Value: 52.233.224.179
Initial TTL: 300 seconds, if supported
```

1. Confirm the DNS owner, approved hostname and that the record does not conflict.
   Keep `coair.ai` marketing and existing `login/user/admin/api.coair.ai` routes
   unchanged during this first rollout.
2. Prepare nginx for the new hostname and obtain its own trusted TLS certificate;
   the cloudapp certificate does not cover it. Preserve `/`, `/coair-api`, `/api/`
   and the optional `/toolkit/` route layout, streaming and upload behavior.
3. Set `AZURE_DEPLOY_ENABLED=false` before the coordinated origin change. Retain
   the current origin's image/configuration rollback set and a consistent data
   checkpoint. Set `AZURE_PUBLIC_ORIGIN` to the approved new HTTPS origin, then
   build/test a matching API/web pair without automatic activation.
4. Requalify and activate the new origin explicitly. Frontend origins are baked
   into the image. For a unified hostname, login/admin/user/app origins use that
   same host; keep the browser API at `/coair-api` and upload base at `<origin>/api`.
   Review real CORS callers, auth links, sessions and callbacks. The release
   controller rejects an unqualified origin change: do not delete the guards or
   edit the JSON records merely to force a deployment.
5. Follow the full transition/rollback procedure in the Word handover. After real
   acceptance, record the newly qualified `target.json` and `release.json`, then
   re-enable delivery and prove a normal branch push reaches the new domain with
   the correct public commit. Agree/test the old-host redirect policy separately.

## 5. Important data boundary before replacing live Coair

Azure currently contains the migrated **original AWS/RAG dataset** from
`63.184.32.196`. Existing Coair portals are on Vercel and `api.coair.ai` points to
`187.53.133.40`, a separate backend. Its hosting provider was not established from
its IP alone. These are not one shared customer database.

Existing live Coair users, production email/OTP, subscription/payment state and
provider callbacks have not been merged into Azure. Repointing those portals or
API before reconciling accounts could make existing customers appear missing.
Select a production topology and approve that account cutover first. Do not
blindly restore the old AWS snapshot over newer Azure usage, reports or chats.

[DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md) records acceptance, source counts,
project-isolation tests and known limits. Chronology partial-coverage warnings
and human review remain relevant. High-concurrency production load is not yet
qualified. Native forensic programme tests used an isolated project; Edinburgh
has no stored native XER programmes yet. Demo's approved Azure limit is 3,000,000
and admin2 remains unlimited; no passwords are included here.

Access to the original AWS host, the separate production VPS/Vercel projects and
mail/payment providers is required only for the corresponding approved cutover
work. Obtain that access from the current owners through their normal secure
process. Azure/GitHub access does not automatically grant those permissions, and
this repository intentionally contains no private keys or provider passwords.

## 6. Completion evidence to return to Kadir

- New hostname resolves correctly; TLS/renewal and redirects work.
- Fresh sign-in/MFA, intended project visibility and cross-project denial pass.
- Upload → private Blob → OCR/indexing → retrieval → original source preview works.
- Chat streaming/stages, tables, chronology and native Word/Excel exports work.
- Latest Actions `deploy_azure` succeeds and public health identifies the same SHA.
- If a full live-account cutover is included: signup/demo requests, invitations,
  role changes, subscriptions and exactly-once usage/payment callbacks pass.
- One writable authority, consistent delta/backup and domain rollback plan are
  recorded before any old workers/services are retired. Confirm which source is
  being retired; do not shut down unrelated applications on the AWS host.

Supporting runbooks:
[MIGRATION_RUNBOOK.md](MIGRATION_RUNBOOK.md) ·
[CONTINUOUS_DEPLOYMENT.md](CONTINUOUS_DEPLOYMENT.md) ·
[DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md).

Official access reference:
[Assign Azure roles to external users](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-external-users).

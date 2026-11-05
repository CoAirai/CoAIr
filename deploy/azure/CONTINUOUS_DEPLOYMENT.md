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

## GitHub configuration

Set up the `azure-demo` GitHub environment with the approved deployment operator
and these secrets. Keep credentials out of Git and chat:

| Secret | Purpose |
| --- | --- |
| `AZURE_HOST` | Azure VM's stable SSH hostname or IPv4 address |
| `AZURE_SSH_USER` | Dedicated approved deployment user |
| `AZURE_SSH_KEY` | Its SSH private key; grant only the intended VM access |
| `AZURE_KNOWN_HOSTS` | Host-key record verified through a trusted VM/console path |

The operator needs access to its deployment files and Docker. No Docker socket
or deployment/SSH secrets are mounted into the application containers. GitHub
uses a temporary job token to pull the same repository's GHCR packages; verify
the organization package access rules. The temporary remote registry credentials
are deleted when the job exits. Host key checking stays enabled.

### Management network from GitHub to the VM

The GitHub-hosted runner needs an approved SSH route; an NSG allowing only the
operator's home IP will block it. Do not open SSH to the entire internet to make
the workflow pass. The prepared private option is `AZURE_USE_TAILSCALE=true`:

- Join the Azure VM to the approved tailnet and set `AZURE_HOST` to its Tailscale
  IPv4/MagicDNS hostname, with matching verified SSH host-key entry.
- Approve a narrowly scoped Tailscale OAuth client for ephemeral CI nodes with
  `tag:coair-azure-ci`. Store `AZURE_TS_OAUTH_CLIENT_ID` and `AZURE_TS_OAUTH_SECRET`
  in the GitHub environment. Approve its tags/permissions at setup time.
- Restrict the tailnet access rule to this CI tag -> this Azure demo host on
  TCP 22. It must not grant access to AWS, DGX or unrelated devices.
  Existing broad wildcard grants must not give this tag wider access; include
  negative access checks when qualifying the management route.
- Verify the route from an actual workflow runner before enabling deployment.
  The optional Tailscale action does not modify tailnet access policy by itself.

If using another approved fixed/private runner route, leave that variable false
and qualify its NSG/routing separately. Check the applicable tailnet plan/terms;
no new paid VPN service or broad access grant is included in the VM estimate.
Official reference: https://tailscale.com/docs/integrations/github/github-action.

Set repository variable `AZURE_DEPLOY_ENABLED=true` only after all one-time
setup/acceptance steps pass. It defaults to disabled. If per-push human approval
is not desired, do not add an environment reviewer requirement; branch tests,
VM identity, mount/image checks and post-release smoke remain mandatory.

## What each enabled push does

1. Run release-guard, Azure readiness/inventory/storage and cloud boundary tests.
2. Build the immutable API and origin-specific web images; run the existing API,
   account/role/billing, PostgreSQL, OCR and web checks before publishing.
3. Connect only through the Azure-specific SSH secrets. Run the target/IMDS check
   from Python stdin before uploading files or registry credentials, then upload
   that commit's small deployment bundle to its immutable release directory.
4. Verify target acceptance, Azure VM/subscription identity, matching image
   commits, single API ownership, loopback ports, expected persistent mounts,
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

# Moving COAir file storage from Amazon S3 to Azure Blob Storage

This guide covers everything needed to move COAir's file storage from Amazon S3
to Azure Blob Storage: what the business owner sets up in Azure, what changes in
the code, how the files are copied, and how to switch over and roll back.

## 1. What is being moved

COAir keeps a working copy of every file on the API server's own disk and mirrors
it to object storage (currently Amazon S3) so nothing is lost if the server is
rebuilt. Browser uploads also go straight to object storage before the server
indexes them.

Current bucket: `coairsuite-aws-s3-uae` in AWS region `me-central-1` (UAE).

Measured on 26 October 2026:

| Folder | Files | Size |
|---|---|---|
| `uploads/` — customer documents, emails, spreadsheets | 7,603 | 17.64 GB |
| `chunks/` — keyword search database | 1 | 0.90 GB |
| `tables/` — spreadsheet data (Parquet) | 1,856 | 0.02 GB |
| `registry/`, `catalog/`, `canonical-events/` | 185 | 0.01 GB |
| **Total** | **9,645** | **18.6 GB** |

At this size the copy takes well under an hour. Nothing else (users, projects,
billing, chat history in the databases) lives in S3, so only file storage moves.

Moving storage does not change how fast the AI answers questions; it is a cost,
compliance or vendor decision, not a performance one.

## 2. What you need to do in Azure (owner tasks)

You need an Azure account with an active subscription and permission to create
resources. Do the following in the [Azure Portal](https://portal.azure.com).

### 2.1 Create the storage account

1. Search for **Storage accounts** → **Create**.
2. **Basics**
   - Subscription and resource group: your choice (e.g. a new group `coair-prod`).
   - Storage account name: lowercase letters and numbers only, globally unique,
     e.g. `coairstorageuae`.
   - Region: **UAE North** (keeps customer data in the UAE, same as today).
   - Primary service: **Azure Blob Storage or Azure Data Lake Storage Gen 2**.
   - Performance: **Standard**.
   - Redundancy: **Zone-redundant storage (ZRS)** recommended; **LRS** is cheaper
     but keeps all copies in one datacentre.
3. **Advanced**
   - Require secure transfer: **On**.
   - Allow enabling anonymous access on individual containers: **Off**.
   - Minimum TLS version: **1.2**.
   - Access tier: **Hot**.
4. **Data protection**
   - Enable soft delete for blobs: **On**, 14 days.
   - Enable soft delete for containers: **On**, 14 days.
   - Versioning: optional (costs more storage; useful if you want file history).
5. **Review + create**.

### 2.2 Create the container

Open the new storage account → **Data storage → Containers** → **+ Container**.

- Name: `coair`
- Anonymous access level: **Private (no anonymous access)**

### 2.3 Allow browser uploads (CORS)

The workspace uploads files straight from the user's browser to storage, so the
storage account must accept requests from the COAir sites.

Storage account → **Settings → Resource sharing (CORS)** → **Blob service** tab,
add one rule:

| Field | Value |
|---|---|
| Allowed origins | `https://user.coair.ai,https://admin.coair.ai,https://login.coair.ai,http://localhost:3000` |
| Allowed methods | `PUT, GET, HEAD, OPTIONS` |
| Allowed headers | `*` |
| Exposed headers | `ETag` |
| Max age | `3000` |

Vercel preview URLs (`*.vercel.app`) cannot be listed with a wildcard in Azure.
Add specific preview URLs only if you need to test uploads on a preview build.

### 2.4 Get the connection details

Storage account → **Security + networking → Access keys** → **Show** next to
**key1** → copy the **Connection string**.

Send these to the developer through a secure channel (password manager or the
server directly; never email or chat):

- `AZURE_STORAGE_CONNECTION_STRING` — the connection string above
- `AZURE_STORAGE_CONTAINER` — `coair`

The connection string is a full-access secret. It goes only into the API
server's `/opt/coair-api/.env`, never into the frontend or into Git.

### 2.5 Optional: restrict network access

Once the switch is complete you can lock the account down further:
**Networking → Public network access → Enabled from selected networks**, then add
the API server's IP (`187.53.133.40`). Leave this until after go-live: browser
uploads come from users' own networks, so this only works if direct browser
uploads are turned off or routed differently.

## 3. What the developer changes in the code

All storage access already goes through one module,
`api/src/gcs_storage.py`, which chooses S3 or Google Cloud Storage from the
environment. Azure is added there as a third option; the rest of the app does
not change.

| Today (S3) | Azure equivalent |
|---|---|
| `upload_file` → `upload_file` | `BlobClient.upload_blob(overwrite=True)` |
| `download_file` → `head_object` + `download_file` | `get_blob_properties` (size check) + `download_blob().readinto()` |
| `list_blobs` → `list_objects_v2` paginator | `ContainerClient.list_blob_names(name_starts_with=prefix)` |
| `delete_blob` → `delete_object` | `BlobClient.delete_blob()` |
| `object_size` → `head_object` | `get_blob_properties().size` |
| `presign_browser_put` → presigned PUT URL | Blob SAS URL with **create + write** permission on that one blob, valid 1 hour |
| `ensure_browser_upload_cors` → sets bucket CORS | Not needed; CORS is set once in the portal (section 2.3) |
| `object_uri` → `s3://bucket/key` | `https://<account>.blob.core.windows.net/coair/<key>` |

Other changes:

- **Dependency:** add `azure-storage-blob` to `api/requirements.txt`.
- **Selection order:** Azure is used when `AZURE_STORAGE_CONNECTION_STRING` is
  set; otherwise S3, then Google Cloud Storage, as today. This lets the code ship
  before the switch without changing behaviour.
- **Browser upload (frontend):** Azure rejects a browser PUT unless it carries
  the header `x-ms-blob-type: BlockBlob`. `putFileOnAmazon` in
  `lib/coair/workspace.ts` must add it when the upload plan says Azure. The API's
  `/upload/direct` response gets a `mode` of `"azure"` alongside the existing
  `"s3"` and `"proxy"`, and user-facing messages that say "Amazon" become
  neutral ("storage").
- **File size:** a single browser PUT to Azure accepts files up to about 5 GB,
  the same practical limit as S3 today.
- **Tests:** unit tests for each Azure function against the Azurite local
  emulator, plus a manual upload, preview and delete test on staging.

Estimated effort: about one working day including testing.

## 4. Copying the files

Use Microsoft's [AzCopy](https://learn.microsoft.com/azure/storage/common/storage-use-azcopy-s3),
which copies directly from S3 to Azure without downloading to a laptop first.
Run it on the API server: it is already in the UAE and close to both clouds.

### 4.1 Prepare

1. Install AzCopy on the server (single binary, no dependencies).
2. In Azure, create a **SAS token** for the container: storage account →
   **Shared access signature** → allowed services **Blob**, resource types
   **Container + Object**, permissions **Read, Write, Create, List**, expiry
   48 hours → **Generate SAS**. Copy the token (starts with `sv=`).
3. Export the AWS keys the server already uses (from `/opt/coair-api/.env`)
   into the shell as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

### 4.2 First full copy (no downtime)

```bash
azcopy copy \
  "https://s3.me-central-1.amazonaws.com/coairsuite-aws-s3-uae" \
  "https://<account>.blob.core.windows.net/coair?<SAS>" \
  --recursive=true
```

AzCopy copies the bucket's contents into the container, keeping the same file
paths (`uploads/...`, `chunks/...` and so on). The app expects these paths
unchanged. Check the summary at the end: "Number of Transfers Failed" must be 0.

### 4.3 Final catch-up copy (during the switch)

Files uploaded after the first copy are picked up by running the same command
again with `--overwrite=ifSourceNewer`. It only copies new or changed files.

### 4.4 Costs of the copy

AWS charges data transfer out of S3 for the 18.6 GB that leaves AWS (a one-off
charge of a few dollars at current rates). Azure does not charge for incoming
data. Check current prices in the AWS and Azure pricing calculators before
starting.

## 5. Switch-over plan

| Step | Who | Downtime |
|---|---|---|
| 1. Create the Azure resources (section 2) and send the connection details | Owner | None |
| 2. Ship the code with Azure support, still running on S3 | Developer | None |
| 3. Test against the Azure container on a staging copy of the API | Developer | None |
| 4. First full copy (section 4.2) | Developer | None |
| 5. Turn on maintenance mode in Super Admin → Operations | Owner/Developer | Starts |
| 6. Final catch-up copy (section 4.3) | Developer | |
| 7. On the server: add `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER` to `/opt/coair-api/.env`, comment out `S3_BUCKET_NAME`, restart the API | Developer | |
| 8. Run the checks in section 6 | Developer | |
| 9. Turn maintenance mode off | Owner/Developer | Ends (about 30 minutes) |
| 10. Keep the S3 bucket untouched for 30 days, then delete it and the AWS access keys | Owner | None |

## 6. Checks after the switch

- The API log at startup reports the storage backend as Azure.
- Upload a PDF, an email and a spreadsheet in a test project; each reaches
  "Indexed".
- Open the uploaded PDF in the document preview and from a chat reference.
- Ask a question in the test project; references open the right document.
- Delete the test files; they disappear from the Azure container.
- Restart the API once more and confirm existing projects still show their
  documents.

## 7. Rolling back

If anything fails after the switch: put `S3_BUCKET_NAME` back in
`/opt/coair-api/.env`, remove the two Azure lines, and restart the API. S3 still
holds every file up to the moment of the switch. Files uploaded while running on
Azure are copied back with the same AzCopy command run in the opposite
direction (Azure as the source, S3 as the destination).

## 8. Security checklist

- The connection string lives only in the server's `.env`; never in the
  frontend, Git, email or chat.
- Browser upload links are SAS URLs limited to one file, create/write only, and
  expire after one hour.
- The migration SAS token (section 4.1) expires after 48 hours; delete it once
  the copy is done.
- After the S3 bucket is retired, delete the AWS access keys in AWS IAM.
- Rotate the Azure access key (key1 → key2) once a year, or immediately if it
  is ever exposed.

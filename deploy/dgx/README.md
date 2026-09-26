# CoAIr Local — DGX Spark pilot

The current Next.js frontend, FastAPI/agent pipeline, PostgreSQL, Qdrant, OCR,
review revisions and original documents run on the customer's device. The API
and web containers have only internal Docker networks. An allowlisted proxy
connects the API to the configured vLLM; there is no cloud-provider fallback.

## Existing inference service

Requirements: ARM64 DGX Spark, Docker with Compose v2.24.4+ (v5 also works),
adequate free memory alongside the model, and a reachable authenticated vLLM
server serving `qwen3-8b` with a 32,768-token context. Do not start a second GPU
model if one already occupies the device.

From the repository root:

```sh
python3 deploy/dgx/setup.py --model-url http://MODEL-IP:8000/v1 \
  --bind DEVICE-IP --port 8080 --import-directory /absolute/document/inbox
# Enter the existing model API key at the prompt.
./deploy/dgx/download_embedding.sh
docker compose -f deploy/dgx/compose.yaml build
docker compose -f deploy/dgx/compose.yaml up -d --wait --wait-timeout 300
docker compose -f deploy/dgx/compose.yaml exec api python scripts/bootstrap_local.py
```

`setup.py` creates owner-only secrets once and refuses to overwrite them. Never
commit/share `.env`, credentials, database volumes or customer documents in an
image. Local accounts use passwords and local JWTs; cloud email MFA and demo-login
fallback are disabled for this mode. The initial account is a company owner,
not a platform-wide superadmin.

Open `http://DEVICE-IP:8080`. The root redirects to sign-in. Configure company
DNS (for example `coair.company.internal`) to resolve to the device; localhost
is not the customer address. This pilot exposes HTTP only on the selected bind
address. Use the Tailscale bind for remote testing; before company-wide delivery,
configure HTTPS using a certificate trusted by that company's clients. The same
image works behind its existing HTTPS reverse proxy. No DNS name or trusted TLS
certificate is created automatically.

## Documents

Use the sidebar's **Document import and OCR review** link or
`/workspace/documents`. Owners can select up to 100 inbox files per import;
project editors can upload and review project documents. Original files are
copied into project storage, never moved or edited. PDF/DOCX/TXT extraction can
be reviewed page by page. Corrections are versioned, stale writes are rejected,
and saving queues reindexing. Excel uses the existing table pipeline; spreadsheet
cell editing is not implemented by this review screen. Encrypted Excel reports
an explicit error. The document list polls processing progress every five seconds.

The appliance sets `OCR_MAX_PAGES=0` (all pages); native text is retained when
available and image pages pass through OCR. Excel/CSV cells are extracted directly
and embedded with sheet/row references in addition to the existing SQL tables.

Large PDF pages are limited to a 25-million-pixel OCR raster. This bounds memory
but can reduce fine-print quality; check those pages manually.

## Local extraction and search

Four durable ingestion workers process documents concurrently. Each can OCR two
pages concurrently using Tesseract (English); native PDF text is used
when available. Embeddings use an authenticated GPU service on the internal Docker network,
with image-bundled `BAAI/bge-base-en-v1.5` weights and 768-dimensional vectors
in local Qdrant. The service uses FP16 CLS pooling and normalized float32 outputs.
It processes eight texts at a time under a serialized GPU lock; measured peak
tensor memory was 329 MB, with a hard PyTorch allocator limit of 0.6% of device
memory. It has no published host port and no WAN route. CPU fastembed remains
available as an explicit alternative, never an implicit fallback. This embedding model is English-focused, matching the English-only application
and Edinburgh corpus. UI labels and generated metadata are in English.

The existing Qwen3-8B instance extracts title, summary, document type, explicit
header date, people, organizations and topics using a JSON schema. Two metadata
requests can run concurrently. Metadata extraction errors are marked for review
and do not block OCR text from reaching the vector index. Named entities must appear literally in their
source page; uncertain dates are blank and marked for review. People mean names
mentioned in the document, not application accounts. Metadata is stored locally
with model/version, text hash, coverage and supporting quotations. Page chunks
also carry the title/date/type/people/summary in Qdrant. Human edits take priority
on reindex. Repeated identical extraction uses a content-addressed cache.

Metadata uses the first 24,000 characters to bound latency/context; long-document
results are marked as sampled, so names in later pages may be absent. All
successfully extracted pages still enter the search index. This is a pilot,
not a guarantee of exhaustive entity extraction or error-free OCR. The OCR review
screen keeps the original and extracted text separately.

Concurrency is deliberately bounded to preserve chat capacity on the existing
32K-context, four-sequence model server. Tune it with representative workloads;
more workers are not necessarily faster on one shared GPU.

## Second device, without an existing model

`compose.model.yaml` optionally runs the same pinned vLLM image used on the
validated Spark. It is not started on the current device (the existing model is
reused). Download a complete `Qwen/Qwen3-8B` model snapshot before disconnecting
the network and set `MODEL_DIRECTORY=/absolute/path/to/snapshot` in `.env`.
Use a strong generated `LLM_API_KEY`, set `MODEL_UPSTREAM=http://llm:8000`, then:

```sh
docker compose -f deploy/dgx/compose.yaml -f deploy/dgx/compose.model.yaml up -d
```

The optional second-device model startup needs a clean-device acceptance test.
Model weights are not embedded in the application image or in the export below.

## Portable application image package

On the validated build host:

```sh
./deploy/dgx/export.sh /absolute/new/package-directory
```

Transfer that directory to another ARM64 device, run `setup.py`, then
`./install.sh`. It validates the image archive checksum and loads the images
without a registry. To include the optional model, separately export/load its
pinned Docker image and copy the model snapshot; then `./install.sh --with-model`.
The application archive includes the GPU embedding runtime and BGE weights,
so it is larger than the original CPU-only pilot archive. It deliberately
excludes all customer data, secrets and Qwen LLM weights.

## Operation

Run Compose commands with `-f deploy/dgx/compose.yaml` from the repo root.
Use `ps` for status and `logs --tail=100 api` for processing errors. `down`
preserves data; **never use `down -v` on a customer installation**.

Back up PostgreSQL with `pg_dump` and the `documents`, `storage`, `qdrant`,
`cache` volumes. Stop application writes while taking a consistent backup;
retain `.env` separately in protected storage. A restore drill and signed
upgrade workflow are still required before commercial delivery.

Implementation references: [Docker Compose override rules](https://docs.docker.com/reference/compose-file/merge/)
and [vLLM serving arguments](https://docs.vllm.ai/en/latest/cli/serve/).

## Entire-inbox ingestion

On the DGX host, run `api/scripts/dgx_import_all.py --credentials /path/to/access.json
--report /path/to/application-ingestion.json` using Python 3 (the command is one
line). The credential file contains `url`, `username`, `password`, `project_id`
and must be owner-readable only. The script imports all inbox paths in batches
of 25, then monitors the durable queue. Its JSON report maps every source path
to its application file ID and processing status, accounting for deduplicated
files. `submission_complete` means queued; only `all_sources_ready` means every
source completed. Password-protected workbooks remain explicit failures until
unlocked. Neither empty nor failed documents are counted as fully processed.

PDF coverage audits are persisted in `storage/ocr_audits`. The full-inbox monitor
runs `python -m scripts.dgx_ingestion_audit` inside the API container at completion
to verify vector presence and page coverage, and saves a separate final report.
Metadata failures are listed independently. See
[the BGE model card](https://huggingface.co/BAAI/bge-base-en-v1.5) for the English
embedding model and its query instruction.

The BGE GPU benchmark processed 128 padded 512-token texts in 0.73 seconds
while the existing LLM was running. Four CPU/GPU comparison vectors had cosine
similarity above 0.99996. This is an embedding-only microbenchmark, not overall
OCR/metadata throughput.

## Recovery after vector write failures

Qdrant needs more than Docker's default 1,024 open files for this corpus. Compose
sets its soft and hard `nofile` limits to 65,536. A collection that reports
`Too many open files` or `Can't write WAL` must be repaired before retrying imports:
apply the Compose configuration and recreate only Qdrant, preserving its volume.
The retry command checks collection health and selects only failed embedding
jobs; it does not retry password-protected workbooks or reset successful jobs.

```sh
docker compose -f deploy/dgx/compose.yaml up -d --no-deps qdrant
docker compose -f deploy/dgx/compose.yaml exec api \
  python scripts/retry_local_embeddings.py --project PROJECT_ID
# Add --apply to enqueue the eligible jobs; --limit 4 allows a pilot retry.
```

New local company setup enables the company-level Chronology and Forensic grants
as well as the initial user's rights. Existing installations retain their grants;
upgrading an image alone does not alter authorization records.

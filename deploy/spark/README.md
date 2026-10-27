# DGX Spark qualification

This deployment uses the current branch's Gemini agent workflow on ARM64. It
runs the application, OCR, exports, local DuckDB and Qdrant on the device; LLM
requests still require cloud access and provider credentials. It is not an
air-gapped/local-vLLM deployment. The older `CoAIr-fixes/deploy/dgx` launcher
cannot be substituted: this branch's provider policy does not support vLLM.

## Before starting

1. Check `uname -m` is `aarch64`, Docker Compose is installed and the Docker
   daemon reports `aarch64`/`arm64`. Review `free -h`, `df -h` and `docker stats`.
   Reserve memory alongside any existing local model; do not start another model.
   No whole-API RAM cap is imposed. DuckDB gets a separate 1 GB working budget;
   OCR/ingestion concurrency starts at one. These are working-set safeguards,
   not document-count or report-length caps. Measure under simultaneous real
   uploads/chat/reports before increasing concurrency.
2. Use a clean checkout of the qualified commit. Create `deploy/spark/.env`
   with `COAIR_COMMIT_SHA`, `SPARK_PUBLIC_ORIGIN` and a new `SPARK_QDRANT_KEY`.
   Default browser binding is loopback, port 3200. For remote tests, set
   `SPARK_BIND_ADDRESS` to the device's Tailscale address, use that exact origin
   and restrict access in the tailnet. Use trusted HTTPS for wider delivery.
3. Create owner-readable `deploy/spark/api.env` containing a unique `JWT_SECRET`
   and the test provider credentials (`GOOGLE_API_KEY`). Set permissions to 600
   on both files. Never copy production environment files or secrets into Git.
   The compose file intentionally blanks production DB, storage, payment and
   email endpoints. Volumes have their own qualification project name. This
   does not migrate existing users, payments or production documents.
4. Inspect `docker compose -f deploy/spark/compose.yml config --quiet`. Avoid
   printing resolved config because it contains secrets. Build natively:

   ```sh
   docker compose -f deploy/spark/compose.yml build
   docker compose -f deploy/spark/compose.yml up -d --wait --wait-timeout 360
   docker compose -f deploy/spark/compose.yml exec api python -m pip check
   ```

   The lock was qualified first on amd64. The separate `DGX ARM64 runtime
   qualification` CI builds and tests it natively, including source compilation
   where an ARM wheel is absent. A cross-platform binary-only resolution is
   insufficient: the pinned hdbscan currently requires that source-build path.
   API and web use their existing Dockerfiles, avoiding a second dependency set.
   The DuckDB FTS extension and embedding weights are baked at build time.

## Functional acceptance and rollback

Bootstrap a new test account using the guarded existing
`deploy/integration/bootstrap.py`, supplying its JSON credentials on stdin to
`docker compose ... exec -T api python` (mount or pipe the script separately).
It requires `COAIR_INTEGRATION=1`; do not reset existing accounts. Upload only
approved sample documents through the UI. Verify project isolation, citations
and original-document opening, new upload/OCR completion, chat tables and
Word/Excel exports, chronology stage progress and factual dates. Test missing
facts too. A successful image build alone does not qualify answer quality.

Record the commit, model IDs, installed lock match, input/output/thinking token
counts, latency, report coverage, peak memory and OOM counters. Run a cold and
cached report against the same frozen evidence, and concurrent chat/upload.
The model's per-call output budget remains finite; report windows/batches carry
all selected evidence through multiple calls. Never solve truncation by silently
indexing partial OCR or by pushing the entire archive into one context.

For rollback, stop this compose project without `--volumes`, switch to the
previous qualified commit/image, rebuild if necessary and restart. Preserve the
volumes and source documents. Do not use `docker system prune` or modify the
existing DGX production stack as part of this qualification.

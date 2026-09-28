# DGX Spark device trial — 28 September 2026

Target: the already configured `spark-9631` device, ARM64 GB10, local PostgreSQL,
Qdrant, English Tesseract OCR, BGE embeddings and Qwen3-8B inference.

## Verified

- The imported Edinburgh archive has 1,240 searchable files and 51,060 vectors.
  The two encrypted workbooks are excluded at the owner's request. The earlier
  final corpus audit accounts for all 15,125 PDF pages.
- A new image-only PDF was uploaded through the authenticated application API
  into a separate fictional acceptance project. OCR recovered the names and
  dates. Editing its metadata saved a version and completed reindexing without
  overwriting the correction.
- The document preview returns both the original page image and reviewed OCR.
  Project path checks reject access to another project's document directory.
- A scoped question correctly identified Alice Morgan and 12 September 2026,
  with a document/page citation (10.8 seconds in that measured request).
- Report `58bcac68189a4c60a83a` completed through extraction, source-preserving
  local synthesis and independent verification. Its downloaded Word file has
  real footnotes and separate events dated 2026-09-12 and 2026-09-14.
- Sixteen targeted Python regression tests and four frontend mapping/history tests
  passed; the production frontend build passed. Existing unrelated lint warnings
  remain. This is not a claim that the complete repository test suite was run.
- Chat history reloads from device storage with citations, and the selected
  authorized project survives browser refresh. The real-archive MUDFA query
  completed in 30.8 seconds with document citations while the large report ran.
- The existing Qwen service was recreated with `HF_HUB_OFFLINE=1`,
  `TRANSFORMERS_OFFLINE=1` and telemetry disabled. All five weight shards were
  available locally. A fresh, uncached application question after restart
  correctly returned Robert Hayes, 14 September 2026 and no defects with a
  source citation (17.1 seconds). The completed MUDFA Word file survived.
- API and sign-in respond on the device's LAN address and mDNS hostname. Docker,
  Avahi and Tailscale are enabled; containers use `unless-stopped`. API/web
  container recreation was exercised. An OS power cycle was not performed.

## Changes exercised

Preserve the complete chat question; serve reviewed OCR with the original PDF;
resolve canonical company/project document paths; write graph files atomically;
resume split report extraction and freeze evidence across retries; avoid a second
lossy synthesis on the small local model while retaining independent claim/date
audits; recover omitted date precision; display real event dates and live report
history; restore saved conversations and project selection; remove cloud invitation/password-reset instructions from local sign-in.
Two report workers allow a small trial report alongside a long archive report.

The existing graph was rebuilt from 1,212 saved notices after a truncated JSON
write was found. It now parses with 1,212 nodes and 325,539 edges; the original
file is retained on the device as a recovery backup.

## Scope and remaining checks

MUDFA report `2a17355ae703406baa5e` completed its 22 extraction batches and
144 verification batches. Final source review found a false contract attribution
that the model verifier had accepted. A regression-tested literal acronym check
now rejects claims naming contracts/organisations absent from their cited
excerpts. Applying the same check to this report removed 20 additional claims;
the original result remains on the device as a recovery copy.

The final Word file has 144 entries including the overview, 95 dated entries,
301 claims/footnotes and 72 cited source IDs, with no unresolved footnotes. It is
52,039 bytes. The report explicitly remains **partial coverage**: the frozen
research snapshot had queued/processing/partial/failed master-event indexing and
no master-event/counter-evidence hits. This does not mean OCR/vector ingestion
failed. Do not describe this report as an exhaustive chronology of the archive.
Large chronologies can take hours; the fictional pilot report is a separate
short acceptance example, not an Edinburgh project finding.

Metadata samples the first 24,000 characters of long documents; all extracted
pages are indexed. OCR and generated answers still require source review.
The current LAN endpoint is HTTP. A cold-boot/physical network-disconnection test,
a clean second-device installation, signed upgrades and a restore drill are
outside the checks completed here. The application image export excludes
customer data, credentials and the separately installed Qwen runtime/weights.

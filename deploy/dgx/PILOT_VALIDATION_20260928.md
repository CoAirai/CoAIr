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
- Fifteen targeted Python regression tests and four frontend mapping/history tests
  passed; the production frontend build passed. Existing unrelated lint warnings
  remain. This is not a claim that the complete repository test suite was run.
- Chat history reloads from device storage with citations, and the selected
  authorized project survives browser refresh. The real-archive MUDFA query
  completed in 30.8 seconds with document citations while the large report ran.
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

The full MUDFA report `2a17355ae703406baa5e` is a separate long-running acceptance
case. Its current status must be checked before presenting it as completed.
The fictional pilot report is not a substitute for that report or an Edinburgh
project finding. Large chronologies can take substantially longer than chat.

Metadata samples the first 24,000 characters of long documents; all extracted
pages are indexed. OCR and generated answers still require source review.
The current LAN endpoint is HTTP. A cold-boot/physical network-disconnection test,
a clean second-device installation, signed upgrades and a restore drill are
outside the checks completed here. The application image export excludes
customer data, credentials and the separately installed Qwen runtime/weights.

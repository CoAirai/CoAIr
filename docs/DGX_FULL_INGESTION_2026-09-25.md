# Full Edinburgh ingestion — 25 September 2026

The application is English-only. Document review UI, generated metadata and OCR
configuration now use English. The installed BGE English model remains unchanged.

All **1242 source files** have been copied into the application and submitted to
its durable queue: **1210 PDFs / 15,125 pages**, plus **32 Excel workbooks**.
All 1242 source paths map to unique application file IDs. Submission does not
mean processing has finished. The device continues processing independently of
SSH or this conversation. The same project is used: `9526e46f951947d1`.

The largest PDF has 1904 pages. The appliance now sets `OCR_MAX_PAGES=0`, so the
previous 500-page cap cannot truncate it. Each PDF page is checked: native text
is retained when available and image/low-text pages pass through OCR. Coverage
audits record every page, including blank/low-text pages without useful text to
embed. These cases must not be confused with silently skipped pages.

Excel cells use direct extraction, preserving source sheet and row references;
all nonempty cells, including headers and final rows, enter semantic embedding
in addition to the existing structured-table pipeline. Native spreadsheet cells
do not require image OCR. Embedded pictures/charts in workbooks are not currently
OCR'd. The workbook parser's late mixed-type Parquet failure was fixed and
Parquet writes are atomic. The shared SQL-loading phase is serialized; four
workers can run extraction/embedding, with two concurrent local metadata calls.

Metadata output allowance was increased after a workbook hit the original limit.
If metadata generation fails, extracted text still enters the vector index and
metadata is explicitly marked for review. Embedding failures remain failures;
they are not reported as completed. The first affected workbook was retried
successfully and its 768-dimensional vectors and English metadata were verified.

## Live reports on the DGX

- Source-by-source progress:
  `/home/coair/datasets/edinburgh-subset-20260924/reports/application-ingestion.json`
- Monitor log: `/home/coair/coair-full-ingestion.log`
- Automatic final audit (written after every job reaches a terminal state):
  `/home/coair/datasets/edinburgh-subset-20260924/reports/application-verification.json`

`submission_complete` means all paths were submitted. `processing_complete`
means jobs reached terminal states, including failures. Only `all_sources_ready`
means every job succeeded AND vector existence / full PDF page coverage passed
verification. The final audit separately lists metadata failures and low-text
pages; a successful vector insertion does not guarantee metadata/OCR accuracy.

**Processing was still running when this change was prepared.** The encrypted
`CEC02085604.xls` and `TIE00661086.xls` require their passwords or unlocked copies.
Excel's documented transparent-encryption key was checked in memory; neither
file accepted it. No source document was modified.

Monitor can be resumed without resubmission:

```sh
python3 /home/coair/dgx_import_all.py \
  --credentials /home/coair/coair-local-access.json \
  --report /home/coair/datasets/edinburgh-subset-20260924/reports/application-ingestion.json \
  --monitor-only
```

Final selected extraction, metadata, local LLM, vector-isolation, mixed-cell
Parquet, encryption and local GPU endpoint configuration checks: **59 passed**.
The English production frontend image built successfully. Ready-file vector
coverage has been checked during processing; final corpus-wide results are
pending and will be written by the monitor.

## GPU embedding acceleration

Large workbooks exposed the CPU embedding bottleneck. The same BGE model now
runs in a separate authenticated GPU service, on the internal network only.
Weights are pinned to `a5beb1e3e68b9ab74eb54cfd186867f64f240e1a`. The existing Qwen
service was not modified or restarted. A 128-text, padded 512-token benchmark
completed in 0.733 seconds (174.5 chunks/second), with 329,369,088 bytes peak
PyTorch GPU tensor memory. Four reference vectors matched the CPU implementation
with cosine similarity 0.999968–0.999984. The server uses an allocator cap,
eight-text internal batches and a serialization lock. This result is a small
embedding benchmark and does not predict whole-corpus OCR/metadata duration.

Live endpoint tests passed: missing/wrong key is rejected, 64 inputs return 64
768-dimensional vectors, 65-input requests are rejected, and the container has
no route to the public internet. Model weights are included in the updated
application image package; customer documents and credentials are excluded.

Latest portable package on the DGX:
`/home/coair/coair-local-package-20260925-en-gpu-v7/` (approximately 25 GB).
This includes the GPU embedding runtime and weights. Generated metadata strings
are length-bounded in the JSON schema to prevent long spreadsheet-cell quotations
from consuming the output budget. A failed metadata call stays visible in the
final report while OCR text and vectors remain usable.

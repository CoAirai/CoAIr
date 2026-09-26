# DGX local recovery — 2026-09-26

## Repairs deployed

- Qdrant's Docker default `nofile=1024` exhausted file descriptors during the bulk
  import. Logs showed `Too many open files`, followed by `Can't write WAL` and
  `segment creator thread already failed`. Compose now sets soft/hard limits to
  65,536. The existing volume was preserved; after recreation the collection
  reported `green` and optimizer `ok`, and real vector writes resumed.
- The initial company had user-level Chronology rights but no company-level
  module grants. The local company's Chronology/Forensic grants were enabled.
  New local bootstrap now provisions both levels, without bypassing user rights.
- Vector insertion now fails if embeddings are missing or any sequential
  fallback write fails. Previously any one successful chunk could mark the file
  successful. Three regression tests reproduce and cover these cases.
- Local Chronology uses 12,000-character evidence batches and synthesis groups
  of three events, instead of cloud-sized 80,000-character / twelve-event groups.
  Its local call timeout is 600 seconds, avoiding the observed 180-second timeout.
  Batching preserves every evidence item/event; three local budget tests pass.
- The Chronology list now polls and distinguishes `GENERATING` from `FAILED`.
  All report rows open their detail page. Word download is disabled until ready.
  The production frontend build includes type checking.

- A separate 422 failure in `CEC00430660.pdf` came from layout padding:
  pages 67/70 produced chunks of 70,950/90,919 characters containing only
  553/309 non-padding characters. The embedding request validator now compacts
  whitespace in oversized strings before enforcing its existing length limit.
  A live 90 KB padding request returned the exact same vector as its compact
  text; genuinely oversized content and batches of 65 inputs still returned 422.

## Live verification

- Browser sign-in succeeded for the existing local account, and Chatbot,
  Chronology and Forensic module cards are accessible. Chronology list/detail
  navigation was verified in Chrome; no mock session was used.
- `/chronology/match` resolves MUDFA to reference `03`.
- The authored MUDFA Word file downloaded successfully (20,188 bytes). This is
  an existing reference report, not evidence that new AI generation completed.
- A new local-model MUDFA job was submitted: `2a17355ae703406baa5e`.
- API health reports chronology/vector runtime ready. Inference targets
  `qwen3-8b` through the internal model proxy. An API-container WAN connection
  still fails with network-unreachable (errno 101).
- Four pilot vector retries succeeded. The remaining 1,120 vector failures were
  requeued. Source files and user review revisions were preserved.

## Background work and limits

The full reimport and the new MUDFA generation are asynchronous. Their submission
is not completion. Check the live report and monitor before claiming complete
corpus coverage or a finished newly generated report:

- `http://100.91.121.116:8080/workspace/chronology/2a17355ae703406baa5e`
- Device log: `/home/coair/coair-recovery-ingestion.log`
- Final corpus audit: `/home/coair/datasets/edinburgh-subset-20260924/reports/application-verification.json`

Two password-protected spreadsheets (`CEC02085604.xls`, `TIE00661086.xls`) require
unlocked copies or their real passwords. They were not repeatedly retried.
Tailscale remains required for the current application address. Company LAN,
trusted HTTPS, and fresh-device installation validation remain separate delivery
work; this recovery does not claim that those are complete.

## Recovery snapshot (20:05 UTC)

The source monitor reported 379 ready files, two password failures and 861
remaining queued/processing files. `CEC00430660.pdf` completed after the layout
padding fix. New MUDFA generation is still in evidence extraction; its first
extraction batch completed and the next batch is processing. This is not yet an
end-to-end generation pass.

A durable monitor records the MUDFA terminal status and downloads/checks the Word
archive if ready at
`/home/coair/datasets/edinburgh-subset-20260924/reports/mudfa-generation-validation.json`.
The updated image package is `/home/coair/coair-local-package-20260926-fixed/`;
its code revision is `904d6a4`. It includes the BGE embedding image/weights but
still requires the separate Qwen runtime/weights for a fresh device.

## Completed corpus audit — 2026-09-27 (Türkiye time)

The document queue has finished: **1,240 ready / 2 password-protected failures**.
Qdrant contains **51,060 vectors** for the source archive. No ready source file
is missing vectors, and there are no recorded metadata extraction failures.
All **1,210 PDFs / 15,125 pages** have completed extraction/OCR audits, with no
missing audits or incomplete page coverage. These checks establish processing
coverage, not a guarantee that OCR or generated metadata is error-free.

The MUDFA job failed separately at synthesis because the overview repeated full
cluster observations and exceeded the local input budget (45,573 > 27,648 tokens).
Revision `b7d3bec` compacts repeated observations while retaining distinct claims
and provenance; the measured cluster payload decreased from 139,256 to 42,529
characters. Local verification groups now contain three claims. Four local
chronology budget/provenance tests pass. The repaired job was automatically retried
after the document queue finished; final report validation remains pending.

The image package was refreshed to revision `b7d3bec` and its SHA-256 check passed.
The final corpus audit is also saved locally at
`/Volumes/Adata/coair-dgx-work/20260924/application-verification-final.json`.

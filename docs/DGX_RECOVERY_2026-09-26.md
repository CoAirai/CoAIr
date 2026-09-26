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

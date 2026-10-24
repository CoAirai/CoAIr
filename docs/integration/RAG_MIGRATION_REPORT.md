# RAG → Coair development report

Updated: 24 October 2026 (Europe/Istanbul).

## Current result

The agent migration packages are deployed to https://coair-test.duckdns.org
on branch `integration/rag-agent-parity`. Production RAG remains the reference.
Coair main, live RAG and dental services were preserved.

The integration now has gated deployment, focused agent regressions and real
API/browser qualification. A real chronology was generated from the Edinburgh
sample and downloaded as narrative Word with resolving footnotes. Full agent,
content-quality, large-corpus and external-service parity remains incomplete.

The comparison covered 177 relevant files: 80 identical, 61 different, 36 Coair-only.
ReAct, query planner and document agent were identical. Important RAG improvements
are in their surrounding retrieval, context, synthesis, verification and export
paths. We ported those changes selectively instead of replacing the backend.

## Implemented changes

| Area | Result and verification |
|---|---|
| Isolated deployment | Dedicated TLS hostname; separate SQLite, DuckDB, Qdrant, uploads and credentials; matched immutable API/web images |
| DuckDB concurrency | Independent reader cursors prevent shared-result races; synchronized eight-worker regression |
| Lexical retrieval | Durable dirty state, migration rebuild and persisted FTS reuse; native scoring query fixed after a real DuckDB Binder error |
| Research workers | Duplicate questions removed; user/project/run/progress context copied into each worker; bounded three-worker chronology synthesis with durable accounting and resumable-step tests |
| Conversation memory | RAG selective follow-up policy: two preceding messages, 3,000-character limit; standalone questions omit history; identical contract tested against both source implementations |
| Database contracts | SQLite ownership/concurrency/recovery suite and disposable PostgreSQL 16 execution of all nine existing migrations; reapplication and transaction contracts are CI gates |
| Agent metadata | Project-local topics/summaries, scoped SQL inventory and selected-document filtering; global graph-party hint omitted |
| Selected documents | Raw document text reaches synthesis without glossary/classification/retrieval expansion; context restored after success and failure |
| Glossary | Original text is processed once; generated definitions cannot recursively grow; repeated-query OOM did not recur |
| Source references | Metadata respects selected IDs; page evidence keeps its citations; canonical document IDs resolve within the active project; canonical Qdrant `file_id` selection and filename hints intersect, including deep agent reads |
| Runtime readiness | Deployment waits for actual background dependency validation; initializing and failed runtimes return HTTP 503 |
| Chronology V2 | Supported numeric punctuation accepted; proven day precision normalized; invalid claims pruned before independent verification; RAG's five overview / four event claims and evidence-led writing profile ported |
| Word delivery | Stored narrative is the default download; explicit `format=table` remains available; Coair XML safety retained |
| Progress UI | Existing report status line displays English backend stage labels and percentages; real browser observed live updates |
| Failed chronology | Failed chronology jobs are hidden from normal lists; direct diagnostics remain; forensic failure/retry visibility is preserved |
| Diagnostics | Structured-output rejection logs field paths and error types without copying private source text |

Coair account, organization, project-security and CA billing implementations were
preserved. `source-manifest.json` records reviewed RAG/Coair SHA256 snapshots and
unchanged protected backend files. RAG worktree overlays are part of the source
baseline; GitHub main alone does not reproduce the running reference system.

## How each migration step is controlled

1. Reproduce a concrete defect with a meaningful failing regression.
2. Port the smallest behavior change and preserve Coair tenancy/accounting.
3. Run focused checks in disposable containers without production mounts.
4. CI runs release guards, authorization/accounting/agent regressions, frontend
   tests and production builds before publishing a matched image pair.
5. Deploy only to the integration stack. Health and real public TLS, access gate,
   password/MFA, project, persisted library, PDF preview and failed-list checks
   must pass. Original RAG/dental container identities and RAG health are checked.
6. Health or public-smoke failure restores the previous image pair. Database
   migrations require their own compatibility decision; image rollback does not
   roll back schema or data.
7. Qualify the actual feature through the public API or browser and record its
   source links, stages, elapsed time and exported Word structure.
8. Prepare the next patch while CI builds the current patch. Review current
   qualification before starting the next deployment.

The workflow is `.github/workflows/integration.yml`. Paid feature checks are
deliberate operator runs:

- `smoke.py --commit <sha> --chat`: selected-source answer and completed progress.
- `smoke.py --commit <sha> --chronology`: actual report, stages and narrative DOCX.
- Add `--retry-report <job-id>` to qualify recovery of an existing failed report.

These commands run on the server with protected local credentials. Provider keys
and passwords are excluded from report and source-control artifacts.

## Measured evidence

The fixed dataset contains three original Edinburgh PDFs: CEC01546478,
CEC01123743 and CEC01630357 (eight indexed vectors). Production source files were
read for upload; production users, balances and writable databases were not copied.

| Check | Observed result |
|---|---|
| Qualified feature release `6d1559d` | 121 API tests, 13 subtests, 152 frontend tests across 38 files, production builds and public deploy checks passed |
| Selected-PDF chat | 13.5 seconds; one correct page citation; five completed backend progress steps |
| Failed-report recovery | Same job `0d1f37b56e4c4effb4b7` retried successfully in 48.97 seconds |
| Recovery Word output | 8 records including overview; 11 resolving footnotes; no tables; 38,543 bytes |
| Full browser workflow | Password/MFA → chronology form → real generation → live stages → Download Word |
| Browser report | 100.31 seconds; 10 events shown; 32 resolving Word footnotes; no tables; 39,436 bytes |
| Browser integrity | No JavaScript page errors or broken images |
| Runtime FTS | Persisted index reuse observed; Binder/LIKE fallback error did not recur in the qualified run |
| Production protection | Original RAG/dental container identities and RAG health remained unchanged; Coair main stayed at `ca5302b` |

The final list-scoping regression additionally checks that forensic failures remain
visible for retry. Current CI/deployment results:
https://github.com/CoAirai/CoAIr/actions/workflows/integration.yml.
The full browser proof is in `browser-check.json`; the qualified UI release is
https://github.com/CoAirai/CoAIr/actions/runs/40051982229.

On AWS, current records are under `/opt/coair-integration`: `release.json`,
`smoke.json`, `verification_history.jsonl`, `chat-check.json` and
`report-check.json`. The first qualified Word artifact is
`qualification-chronology.docx`. Both ready reports remain available in the
authenticated test application's chronology list.

## Failures found and corrected during qualification

- A selected-document query returned HTTP 502 and triggered an isolated API OOM.
  Logs showed recursive glossary growth over injected source text. Single-pass
  glossary handling and separation of answer context corrected that path.
- A subsequent answer lost page citations behind metadata-only records and
  included unselected documents. Source merging/filtering was corrected; strict
  selected-source acceptance then passed.
- The first real chronology failed after 83.81 seconds at overview synthesis with
  `model_output_invalid`. The old code did not retain a field-level rejection
  cause. After RAG capacity/style alignment and safe diagnostics, the same job
  retried successfully. This establishes recovery, not definitive proof of the
  original response's exact schema violation.
- Native BM25 hit a DuckDB side-effecting-alias Binder error. A real DuckDB
  side-effecting-UDF regression fails on the old query and passes with score
  materialization, including project/document filtering.

A missing project header in the operator progress check was corrected separately;
the existing answer's progress was checked without repeating its provider call.

## Remaining deficiencies and next gates

| Priority | Gap | Required acceptance |
|---|---|---|
| Critical | Normalized date proof | Prove normalized year/month/day against the cited wording at the claimed precision; add ambiguous, relative and OCR date cases |
| High | Full content-quality parity | Same corpus/topic/model/settings on RAG and Coair; compare grounded claims, dates, coverage, source anchors and professional narrative |
| High | Full-corpus speed | Bounded parallel synthesis is ported and tested; repeat matched-corpus measurements on representative large projects and concurrent workloads |
| High | Full tenant/tool coverage | Extend beyond tested prompt paths to all graph/tools, cache keys, structured SQL and cross-company source handling |
| High | Account/payment/external-store qualification | Invite, activation, reset and session lifecycle; Stripe test-mode checkout/duplicate webhooks; Hosted Supabase/auth and object-storage dry runs with separate credentials (native PostgreSQL adapter contracts now pass) |
| High | Forensic and structured-tool parity | Representative source-grounded forensic narratives and spreadsheet/calculation cases; preserve Coair sheet/TXT/XML improvements |
| Medium | Remaining routing/timing differences | Selective memory is aligned; retain intentional Coair accounting and source-scope fixes, and assess additional routing paths by behavior rather than file identity |
| Medium | Legacy ownership and deployment continuity | Assign project ownership to legacy records; restore graph-party hints only through scoped APIs; qualify active-job restart/drain/resume before wider use |
| Medium | Dependency maintenance | Separate tested upgrade for the deprecated Gemini adapter/SDK import |

The date gap is demonstrated, shared by both repositories, and remains unresolved.
An isolated guard accepted `event_date=2099-12-25` with wording `19 April 2007`.
The actual sample also contains short anchors such as `3rd` and `29th April`;
matching a substring does not prove full date precision. Independent claim
verification alone does not establish correctness of every event-date field.

The browser correctly labels the report Preliminary/partial, and its manual
review count remains zero until a person reviews it. AI checks and Word structure
are separate from that human verification. Some same-page source chips repeat
because distinct evidence excerpts share an anchor; presentation deduplication
can be assessed without losing evidence identity.

The earlier browser/recovery reports use different topics and source-selection paths, so
49 versus 100 seconds is not a fair speed comparison. The new same-data benchmark is documented in `FOUR_STAGE_ACCEPTANCE.md` and `performance-check.json`. Three PDFs cannot qualify
the full Edinburgh corpus. The existing RAG reference has 29 paragraphs and 53
footnote references on different source coverage; matching its quality requires
the controlled same-data comparison, not matching a paragraph count.

Staging deliberately disables real email/payment/bucket/live-database connections.
Only the configured Gemini/BGE/V2 policy was exercised. Coair CA micros differ
from legacy RAG model-token/demo-credit units: do not copy balances or replace
Coair billing with legacy methods. Source-level tenant defects used fake fixtures;
no live customer-data access or exfiltration was demonstrated.

## Four-stage follow-up

See `FOUR_STAGE_ACCEPTANCE.md` for each stage's acceptance, and
`performance-check.json` for matched runtime measurements. No production user,
organization or billing database was migrated. An excluded reference probe proved
why: legacy RAG's positional ledger insert expected 23 columns while Coair has 24.
The valid reference run creates its user through RAG's native schema. DuckDB
1.5.5 in the reference cannot open the target's DuckDB 2.0.0 file format; the old
ChunkStore then silently falls back to an empty in-memory store. The new
`src.corpus_snapshot` command exports project-scoped chunks and document search
metadata as integrity-checked JSON and imports into a new native-version database.
It preserves canonical IDs and evidence text, excludes account/payment tables,
and refuses to overwrite an existing destination. PDF bytes and eight vector
records remain the same. No production database was replaced.

A real deep-search escalation also exposed document-selection widening inside the
project. The target now selects canonical vector `file_id` with a legacy `doc_id`
alias and intersects filename hints. A real local Qdrant/LlamaIndex integration
test verifies retrieval, conflicting filename reads and project isolation. The
matched target run additionally checks every returned citation against the
explicitly selected document IDs. Legacy reference behavior is recorded separately.

## Working location

The integration checkout is `/Volumes/Adata/Codex/CoAIr-integration`; its original
Desktop path is a symlink. Mac disk pressure caused write failures, so the small
integration checkout moved to Adata after all pending changes were hash-verified.
Original dirty RAG and Coair worktrees were preserved. No local dependency
installation or large corpus copy was required.

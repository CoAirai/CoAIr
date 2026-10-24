# RAG → Coair development and migration report

Updated: 24 October 2026 (Europe/Istanbul).

## Objective and current scope

Port proven AWS RAG behavior into Coair through small verified changes, preserving
Coair's interface, organizations, project permissions, account lifecycle, CA
accounting and payment implementation. Target branch: `integration/rag-agent-parity`,
based on Coair main `ca5302b`. Test: https://coair-test.duckdns.org.
Production RAG remains the reference; live Coair, RAG and dental are not deployment targets.

The comparison covered 177 relevant files: 80 identical, 61 different, 36 Coair-only.
ReAct, query planner and document agent were identical. Major missing improvements
are around retrieval, request context, chronology validation, progress and exports.
Copying all RAG agent files would not reproduce the deployed system.

The integration checkout is on Adata because the Mac volume repeatedly refused
writes for lack of space. The original Desktop integration path is a symlink to
`/Volumes/Adata/Codex/CoAIr-integration`. Original dirty RAG and Coair worktrees
were preserved. All nine then-uncommitted files were hash-verified before removing
the superseded integration worktree.

## Verification contract

1. Reproduce the defect with a meaningful failing regression.
2. Port the smallest behavior change, preserving tenancy and Coair accounting.
3. Run focused tests in a disposable container without production mounts.
4. CI runs release guards, authorization/accounting/agent regressions, frontend
   tests and production builds before publishing matched immutable images.
5. Deploy only the isolated integration stack. Container health and real public
   TLS, access gate, password/MFA, project, persisted library, PDF preview and
   reference-container checks must pass. Failure restores the previous image
   pair. Database migration rollback is not provided by image rollback.
6. Qualify the actual feature through its public API. A health check alone does
   not establish AI correctness. Paid AI checks are deliberate operator runs.
7. Prepare the next patch while CI builds the current patch. Review the current
   qualification before starting the next deployment. Record failures as gaps,
   not successful migrations.

`deploy/integration/smoke.py --commit <sha> --chat` performs a real selected-PDF
query, source and completed-progress checks. `--chronology` generates a real
report, polls stages and checks the downloaded DOCX for narrative structure and
resolvable Word footnotes. These options incur provider usage and are not run
on every automatic deploy. Successful release checks append to server
`verification_history.jsonl`; current detailed checks remain in `chat-check.json`
and `report-check.json`.

## Migration ledger

| Area | Implemented change | Evidence / remaining gate |
|---|---|---|
| Deployment | Dedicated TLS hostname, isolated SQLite/DuckDB/Qdrant/uploads, automatic branch deployment and rollback guard | Baseline browser, upload, source preview and persistence passed |
| DuckDB | Independent query cursors; reader results no longer share state | Eight-worker regression; deployed in 533e84f |
| Lexical index | Durable dirty state, one-time old-DB rebuild, clean persisted-index reuse; Coair async sync retained | Restart/mutation and reuse-decision regressions passed; actual warm FTS reuse still needs runtime proof |
| Research retrieval | Deduplicated questions and independently copied request context per worker | Context/correlation regressions; deployed in 533e84f |
| Planner / ReAct metadata | Project-local document topics and summaries; project/explicit SQL allow-list applied before ranking; global graph-party hint omitted | Eight project/empty-scope/selected-document/failure/legacy-table regressions; deployed in aa234b1 |
| Glossary | Single-pass expansion and replacement over original matches | Four regressions; deployed in aa234b1; the repeated-query OOM did not recur |
| Selected evidence | Keep raw source text out of glossary/classification/retrieval and supply it only to synthesis; preserve Coair follow-up history | Five focused tests including single/dual paths and cleanup; next deployment |
| Source references | Respect selected IDs during metadata enrichment, retain actual page evidence, resolve canonical IDs within active project | Focused tests passed; public selected-source acceptance pending |
| Chronology validation | Ignore sentence punctuation around supported numbers; normalize proven day precision; prune invalid claims before independent verification | Three regressions including rejection of fabricated facts/missing clusters; next deployment |
| Word download | Serve stored narrative by default; table remains available through explicit `format=table`; retain Coair XML safety | Default/explicit-format/project-boundary regression passed; actual generated Word download pending |
| Failed reports | Hide failed jobs from normal project list; keep active jobs and direct diagnostics | Regression passed; next deployment |

## Verified releases and observed failures

- Baseline `8efc3b1`: 50 API tests, 151 frontend tests and production builds.
  Browser password/MFA login and workspace passed. Three original Edinburgh
  PDFs indexed into eight vectors. Initial source-cited chat took 14.43 seconds;
  preview and conversation survived deployment. This is a connection baseline,
  not a full report-quality benchmark.
- Retrieval `533e84f`: 54 API tests and successful deployment:
  https://github.com/CoAirai/CoAIr/actions/runs/40048617388.
  A stricter real selected-PDF query returned HTTP 502; Docker recorded an OOM
  and API restart at the isolated 2 GiB limit. Logs showed recursive glossary
  growth over injected source text. Both source repositories had that defect.
- Scope/glossary `aa234b1`: 66 API tests and successful public deployment checks:
  https://github.com/CoAirai/CoAIr/actions/runs/40049317592.
  Repeating the selected-PDF question returned an answer without restart.
  Strict source acceptance still failed: metadata records hid page citations
  and included other documents. That finding motivated the next source patch.
- The next combined API regression gate passed 117 tests before the final
  citation refinements; the five updated selected-context/source tests then
  passed separately. CI and feature qualification remain the release gate.

## Remaining deficiencies, in priority order

1. **Normalized date proof (critical before live promotion).** The deterministic
   guard checks that quoted date wording exists but does not prove that the
   normalized event date matches it. An isolated reproduction accepted
   `event_date=2099-12-25` with source wording `19 April 2007`. This shared
   defect needs strict date/precision matching and representative regressions.
   The independent claim verifier is not proof that every event-date field is
   correct. Day/exact normalization does not fix this mismatch.
2. **Full quality and latency parity.** Three PDFs cannot qualify large corpora,
   conflicting evidence, emails, spreadsheets or long legal narratives. Freeze
   the same sources, topic, model and settings on RAG and Coair; compare grounded
   claims, dates, source anchors, document coverage, footnotes and stage/total
   time. A structurally valid DOCX is not a content-quality approval.
3. **Bounded parallel synthesis.** RAG's three-worker V2 synthesis is not yet
   ported. Verify real user/project/run attribution, atomic CA ledger updates,
   one charge per provider attempt, cache behavior and aggregate usage reporting
   before enabling it. Copying ContextVars does not merge numeric counters.
4. **Remaining context/routing parity.** Keep Coair follow-up support, original
   sheet reader and content retrieval. Compare RAG's selective history,
   routing/timing changes and multi-step tools with focused cases; do not
   overwrite the whole router or planner.
5. **Progress in the public UI.** Backend stage/progress checks are necessary,
   but the real Next.js chronology screen must also be observed through a report
   run. Do not confuse changes under legacy `api/frontend` with public Next.js.
6. **Accounts, payments and external stores.** Existing authorization/accounting
   regressions are retained. Full invite/activation/reset/revocation lifecycle,
   Stripe test-mode checkout and duplicate webhooks, Supabase/Postgres and object
   storage migration need separate test credentials and dry-run checks. Staging
   deliberately disables real email/payment/bucket/live-database connections.
7. **Legacy ownership and graph metadata.** Records without project ownership
   are omitted from agent metadata. Assign ownership explicitly instead of
   allowing global fallback. The project-unsafe graph-party hint needs a scoped
   API before it can be restored; this patch does not certify every graph/tool.
8. **Forensic and structured-tool parity.** Preserve Coair sheet/TXT/XML
   improvements; compare source-grounded forensic narratives and structured
   calculations on representative files. No forensic parity claim yet.
9. **Runtime reproducibility and maintenance.** Production RAG includes local
   overlays and effective environment overrides. Preserve source/config hashes,
   stable IDs and approved V2/model policy. A legacy Gemini adapter emits a
   deprecated SDK warning; dependency upgrades belong in a separate tested change.

Coair CA micros and legacy RAG model-token/demo-credit units are different.
Do not copy balances or replace the Coair ledger with legacy billing methods.
The source-level tenant defects were reproduced with fake fixtures; no live
customer-data access or exfiltration was demonstrated. Keep production untouched
until the remaining source/date, quality, accounting and migration gates pass.

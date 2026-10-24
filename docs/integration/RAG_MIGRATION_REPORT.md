# RAG agent migration and development report

Updated: 24 October 2026 (Europe/Istanbul).

## Objective and boundaries

Bring the proven AWS RAG agent behavior into Coair through small, independently
verified commits. Preserve Coair's Next.js interface, organization/project
permissions, account lifecycle, CA accounting and payment implementation.
The target is `integration/rag-agent-parity`, based on Coair main `ca5302b`.
The test URL is https://coair-test.duckdns.org; production RAG remains the
reference, and production Coair, RAG and dental services are not deployment targets.

The baseline comparison covered 177 relevant files: 80 identical, 61 different,
36 Coair-only. ReAct, query planner and document agent implementations were
identical; important improvements live in retrieval, thread context, chronology
validation and export integration. Replacing all agent files would lose useful
Coair additions without reproducing the running AWS system.

## Verification process

1. Reproduce each defect with a regression that fails on the original code.
2. Port only the necessary behavior; keep Coair storage, tenancy and accounting.
3. Run offline focused tests in a disposable container with no production mounts.
4. Commit the patch and its regression evidence to the integration branch.
5. CI runs release guards, API authorization/accounting and agent regressions,
   frontend tests and both production builds before publishing matched images.
6. Deploy only to the isolated stack. Container health and public TLS, access
   gate, password/MFA, project and persisted-library checks must pass. Failure
   restores the previous image pair. This does not roll back a database migration.
7. Run feature-specific checks and update this report with the result and limits.
   Prepare the next small patch while CI builds the current one, but do not push
   the next deployment until the current deployment's evidence is reviewed.

## Completed baseline

- Dedicated hostname, TLS, isolated API/web/Qdrant, SQLite, DuckDB and uploads.
- Two successful automatic deployments through commit `8efc3b1`.
- 50 API tests; 151 frontend tests; successful production builds.
- Real browser password/MFA login and workspace; no page errors or broken images.
- Three real Edinburgh PDFs indexed in staging (eight vectors).
- Real source-cited chat response in 14.43 seconds; PDF preview and conversation
  persisted across deployment. This is a connection check, not a quality benchmark.
- Original production container identities and RAG health remained unchanged.

## Migration ledger

| Area | Gap / consequence | Change and acceptance | Status |
|---|---|---|---|
| DuckDB readers | Shared connection result state can mix parallel query results | Independent cursors; synchronized eight-worker regression | Deployed in 533e84f; 54 API tests passed |
| Lexical startup | Restart forces avoidable FTS rebuild; dirty flag is not durable | Persist dirty flag, rebuild old databases once, reuse clean persisted index; retain Coair async sync | Deployed in 533e84f; 54 API tests passed |
| Evidence retrieval | Repeated expansion/duplicate searches; worker context can lose project/user/progress/accounting identity | Deduplicate questions; copy request context independently into each lane | Deployed in 533e84f; 54 API tests passed |
| Planner metadata | Global clusters, summaries, SQL inventory and graph parties may enter another project's prompt | Scope metadata before prompt construction; empty/unknown scope must not expose other projects | Eight offline regressions passed; CI/deploy pending |
| Chronology V2 | Serial synthesis; one unsupported claim can discard valid claims; numeric punctuation/date normalization differ | Bounded workers with context, prune unsupported claims before verification; accept supported facts and reject invented facts | Pending |
| Word output | Coair download may regenerate a table instead of serving accepted narrative | Preserve numbered narrative and real footnotes through actual download route; explicit format policy | Pending |
| Progress and failed reports | Backend and public Next.js need end-to-end confirmation | English stages, actual timing, terminal errors; hide failed items from normal list while keeping diagnostics | Pending |
| Report quality and latency | Small chat smoke is insufficient | Same corpus, project, topic, model and settings; measure grounded claims, date accuracy, resolvable sources, DOCX structure and total/stage time | Pending |
| Management and billing | RAG token quota and Coair CA micros have different units | Keep Coair ledger; test tenant authorization, session lifecycle and one charge per provider call; no direct balance copy | Existing tests retained; full lifecycle pending |
| External integrations | Staging intentionally disables real mail, payments, Supabase and object buckets | Separate test credentials; test-mode payment/webhook idempotency, invite/reset and migration dry run | Not qualified |
| Forensic / structured tools | Coair adds useful sheet reading; native/demo paths differ | Keep additions; compare source-grounded forensic narrative and structured calculations on representative files | Pending |

## Findings that need special care

The shared prompt-metadata defect was reproduced with fake two-project fixtures;
it is not evidence that live customer data was accessed. Both repositories need
the fix. SQL execution guards alone do not prevent filenames, summaries, topic
labels or parties from leaking into a planning prompt.

Production RAG includes worktree overlays and effective environment overrides;
GitHub main alone does not reconstruct it. Every port must cite the actual
source change. Keep provider, embedding profile and V2 policy fixed during
comparisons. Model or V3 changes require separate acceptance.

Coair's `token_limit` / `used_tokens` fields use CA micros derived from provider
cost, unlike the legacy RAG model-token/demo-credit rules. Do not copy RAG's
billing functions or balances. Context propagation tests do not prove correct
ledger attribution or aggregate call-budget enforcement; those require explicit
multi-worker accounting tests before acceptance of synthesis parallelism.

Keep Coair's async object sync, sheet reader, TXT encoding handling, Word XML
safety and project/session guards. Keep the root Next.js UI separate from the
legacy Vite frontend bundled under `api/frontend` when checking visible behavior.

The three-document sample does not cover large-project retrieval, long reports,
spreadsheets, emails, conflicting evidence or document failures. Before declaring
parity, add a small fixed representative corpus with expected source anchors and
unsupported-fact cases. Generated reports must be checked through the same
public API/download path users actually use. Compare quality and latency to
RAG before replacing any live service.

## Release evidence

Baseline deployment: https://github.com/CoAirai/CoAIr/actions/runs/40035174669.
Server qualification records are under `/opt/coair-integration`: `smoke.json`,
`qualification.json`, `chat-check.json` and `release.json`. These contain no
provider keys; credentials remain in protected server configuration.

First retrieval patch: four offline regressions passed in a network-disabled
container without production mounts. The original image fails these checks;
the worker test specifically reproduces missing project/correlation context and
redundant query variants. The FTS reuse decision is mocked in this unit suite;
actual extension/index reuse still requires runtime confirmation.

Planner metadata patch: eight offline regressions passed for project switching,
empty/missing scope, selected document IDs, registry failure, overbroad registry
results, SQL allow-list intersection and the existing legacy corpus table policy.
The global graph-party hint is deliberately omitted from planning because it
has no safe project API. Legacy documents without project ownership are not
used as prompt metadata; ownership needs an explicit migration rather than a
global fallback. These checks do not certify every tool or graph endpoint.

The deploy smoke check now also checks a real PDF preview, production RAG
health and original production/dental container identities. Successful checks
append a compact per-release record to `verification_history.jsonl`.

Retrieval release `533e84f`: CI passed 54 API tests and the frontend build/test
gate, then deployed successfully. Public password/MFA/project/library checks
passed. Workflow: https://github.com/CoAirai/CoAIr/actions/runs/40048617388.

The smoke script accepts `--chat` for a deliberate real provider query after
deployment. It checks selected-document citations and actual completed progress
events, and records elapsed time and the full answer in server `chat-check.json`.
It is not enabled for every automatic deploy, so a deployment does not incur an
unnecessary AI call.

A legacy Gemini adapter import emits a deprecated SDK warning in the test image.
Keep dependency cleanup separate from behavioral migration and verify the active
provider path before upgrading.

## Selected-document runtime failure and corrective patch

The real selected-PDF chat on 533e84f returned HTTP 502. Docker recorded an OOM event and one API restart at the isolated 2 GiB limit. Logs showed recursive glossary growth over the injected document text. Both source repositories have the same multi-pass routines. Two regressions fail on the original routines; four pass with single-pass replacement over original matches. Generated definitions are never recursively expanded. The same public selected-PDF query must pass after deploy before this finding can close. Separating the original question from full answer context, as RAG does, remains a further migration task.

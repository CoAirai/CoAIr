# Four-area release review — 25 October 2026

Target: `integration/rag-agent-parity`, the isolated AWS Coair test environment.
The production RAG deployment and main branch are reference systems.

## 1. Chronology

Implemented exact normalized-date/quotation matching, including the `03-Jul-08` schedule format; separate model decisions for event dates and factual claims; date revalidation after unsupported claims are removed; and final chronological sorting/renumbering. Unknown dates do not turn otherwise sourced facts into analytical inferences. Date decisions cannot reuse the previous claim-only verification cache.

Structured-output retries now include full cardinality constraints inside the existing retry budget. There is no silent clipping of claims or source lists and no additional unbounded retry loop.

The accepted RAG reference prompt signatures are retained. One target-only verifier prompt difference is explicitly recorded in the contract fixture, with source text/quote/claim preservation regressions. Generation, extraction, planner and style prompt contracts remain protected.

Real native full-project runs use the same 135451 chunks and corpus integrity hash as the previous review, project-scoped read-only Qdrant access, separate native account stores and Gemini 3.6 Flash. The first date-check run exposed an unsupported short-year format and is retained as a failed quality probe, not presented as success. After repair, Gogar completed in 140.59 seconds, including recovery from a real oversized-overview response within the original retry budget. It retained six event rows, five dated, including the 13 October and 6 November programme milestones, explicitly described as scheduled rather than proven completed work. Utilities completed in 155.13 seconds; the retrospective 59000m quantity was retained without assigning it the design-document date.

Reports remain partial. These samples support the repaired behavior, not universal completeness or a controlled speed claim. Updated final metrics, chat comparison and deployment checks follow below.

## 2. Chatbot

Interactive tables now filter/sort without altering export order, preserve typed SQL values, and offer XLSX/CSV plus Word exports. Compact headings and fenced code render correctly. Account/project credentials are sent in headers. Exports format caller-held content and never search another project. Existing saved SQL artifact/source behavior is retained.

The full frontend suite/build and full-corpus native selected-document/follow-up/standalone checks are release gates. Legacy RAG source-library metadata is incomplete; the private benchmark reconstructs only two same-project library records from existing corpus filenames to exercise selection without adding text, files or vectors. This is not a complete production-library migration.

## 3. Toolkit, resources and management

All 19 native modules were run against the same XER fixtures and the actual deployed RAG toolkit engine source. Result structures, artifact kinds and Excel cell content matched exactly for all 19. This proves the tested deterministic calculations, not every Streamlit/React interaction or every possible input.

The existing native Word report assembler is exposed from Coair's tool page; optional AI narrative and its warnings are displayed. The native engine remains the numerical source of truth. Default analysis does not add a model call. The existing Coair appearance and plan/credit rules are retained.

The API's fixed 2 GB container ceiling is removed in the integration compose configuration. DuckDB gets a separate 1 GB search budget and one thread, allowing spill to disk without limiting the whole API/report process. The reference RAG/toolkit containers are not altered.

The missing platform-admin organization PATCH route is restored with the existing store methods, admin authorization and null-field validation. Production invite responses no longer expose the internal email OTP. Organization, payment and user databases are not replaced. Live Stripe/email delivery stays disabled in this isolated test stack; mock/provider-independent contracts are distinct from external-service acceptance.

## 4. DGX

The device remains offline. Prepare and test the local appliance source separately; retain local auth, quotas, GPU admission, source-preserving Qwen chronology and protected packaging. Do not merge local appliance configuration into the cloud application or claim that cloud model tests qualify Qwen. ARM/protected-image deployment, tailnet HTTPS and real device report quality remain pending device access.

## Verification and release record

Initial broader regression: 515 passed, two failures. One was the intentional date-verifier prompt change, which now has an explicit target-only reviewed contract; the other reproduced the missing organization PATCH endpoint. Focused repair run: 92 passed. Native toolkit engine comparison: 19/19 equal. Additional final CI, browser/live and native chat results are recorded when completed.


### Final cloud deployment and regression results

Release `0488dbc5fc58ade61a93552c94eba457b8e8a74f` was pushed to the integration branch and deployed successfully by GitHub Actions run [40208233756](https://github.com/CoAirai/CoAIr/actions/runs/40208233756). CI passed 523 API tests plus 13 subtests, three real PostgreSQL tests, 169 frontend tests, production build and guarded deployment smoke. Live Docker inspection confirms API Memory=0 (no fixed container ceiling), with healthy target services. Main and the reference RAG services were not replaced.

The native same-document chat comparison completed six responses per implementation. Coair returned nonempty selected-scope citations in all six. Reference RAG returned the same basic answers, but its two follow-up responses included additional same-project documents outside the selected pair. Observed Coair means were 11.08 seconds selected-document, 8.65 follow-up and 12.72 standalone-after-history; RAG means were 52.46, 14.94 and 17.61 seconds. These are two samples per category with different native caches and ID representations, not a controlled speedup benchmark. Canonical IDs and legacy vector identities were mapped to the same underlying two documents; no corpus text was changed.

The original source disk contains 7,307 PDFs and 206 registry records; the exported search corpus contains 7,289 distinct filenames. The isolated Coair demonstration library still has three sample documents. Full native corpus qualification does **not** mean the production document library, OCR lifecycle or customer datasets have been migrated and reconciled. That remains a separate inventory/migration acceptance step before production promotion.

### DGX source delivery

The local appliance changes were committed and pushed separately as `81f00ad` on `codex/dgx-appliance-parity`; cloud-only configuration is not merged into that source branch. Local source tests passed 78 API tests (one cloud-only retry test excluded, with local HTTP retry/accounting tested separately), 167 frontend tests, TypeScript and both default and explicit local-mode production builds. Source CI runs independently of device deployment. Real ARM/protected-image, Qwen quality, GPU and tailnet HTTPS acceptance still require the offline Spark to return.

### Remaining acceptance boundaries

Do not describe these checks as perfect RAG equivalence. Chronology reports remain partial; deterministic toolkit equality is for the tested fixtures; live external email/Stripe flows and a reconciled production document/OCR migration remain unqualified. Account/role/organization/payment tests passed without replacing their stores. The organization PATCH and OTP-response corrections are explicit small changes to the older preserved-file snapshot, superseding its byte-identical claim for those endpoints.

### Public post-release acceptance

The deployed public hostname passed authenticated Word export (native headings, bold text, tables and citations), XLSX export (typed zero/false, formula-looking text kept literal), real DCMA execution with a ready AI narrative, native Word report assembly containing that analysis, and foreign-project workspace/artifact rejection (404). The assembler correctly honors the saved workspace report title ahead of ad-hoc run parameters. The initial harness incorrectly expected the latter; its expectation was corrected and the whole public acceptance rerun passed. Only disposable QA programmes/projects were created; programmes were deleted and QA projects archived afterwards, with the existing library inventory unchanged. Evidence: `live-feature-acceptance.json`.

The first remote DGX source CI found frontend unit discovery entering the separately configured API Playwright suites; explicit `api/**` exclusion corrects this test-runner boundary without changing application behavior. The repeat CI is the final source gate.

### Mapping to the requested four migration stages

1. **Agent orchestration:** RAG generation/planner/style contracts retained, one reviewed verification-prompt exception; real chronology and all 19 toolkit comparisons completed. The remaining gap is exhaustive narrative completeness, not a failed release test.
2. **Conversation context:** selected-document, follow-up and standalone-after-history requests were exercised in both native implementations; Coair passed all six citation-scope checks. Project filters and modern/legacy selection boundaries have dedicated regression and actual Qdrant checks.
3. **Database and application controls:** source corpus copies were imported into separate native QA stores, not production account/billing stores; real PostgreSQL regression passed. Organization update/archive controls, roles and commerce contracts passed. No production customer/payment/token database replacement was performed. Full document-library reconciliation and live external-provider acceptance remain separate gates.
4. **Query times and output:** native chat sample means and real chronology times are recorded above. Completed live Word/Excel/toolkit exports and healthy deployment/resource checks support use of the isolated dev stack; they do not guarantee every query latency or document completeness.

### Final independent DGX source CI

After the discovery-boundary repair, commit `b18c781` passed both API and web jobs in [40209787996](https://github.com/CoAirai/CoAIr/actions/runs/40209787996). The API image built successfully and the 78-test local source contract gate passed; the frontend unit tests, TypeScript and local-mode production build passed. The branch is pushed. Hardware/protected deployment remains pending, as distinct from this successful source qualification.

## Group discussion review — 26 October 2026

Reviewed integration `207aa2e` against freshly fetched main `f5b1238`. Main has two new commits after the shared `ca5302b` baseline: `771ad53` (DuckDB BM25 correction and Azure migration guide) and `f5b1238` (background FTS warm/build and VPS deployment script). No application changes, merges or live configuration changes were made during this review.

### Storage and source references

The claim that replacing S3 necessarily requires re-ingestion is too broad. `lib/coair/documents.ts` resolves citations through authenticated, project-scoped `/docs/{id}/content`, not a persisted public S3 URL. `DocumentService` resolves registry/catalog/vector membership, approved local paths and on-demand object-store downloads. Original objects, stable document/project identities, locators and lookup metadata must remain resolvable. Copying source objects and updating the storage adapter/path resolution can preserve embeddings and OCR; reprocessing is necessary only for missing/invalid derived data or deliberate pipeline changes. Re-ingesting everything changes legacy path-derived IDs and can itself break old references or create duplicates.

Neither reviewed branch implements Azure storage: main only adds a guide. Implementation is broader than one adapter switch: backend selection and object operations; upload-plan modes/model; frontend PUT headers and completion; canonical artifact URI recognition (currently only `s3://` and `gs://` are remote); and source path resolution all need coordinated checks. An `https://...blob.core.windows.net/...` canonical URI would currently be handled as a local path unless this reader is adapted.

The guide's statement excluding chat history from object storage is incomplete: `gcs_storage.py` has conversation JSON and review-session sync functions, in addition to uploads, chunks, registry, Parquet/catalog, feedback and converter registry. This does not prove those prefixes contain production objects; it means the migration inventory must enumerate them rather than assume absence. The guide's measured bucket inventory, transfer duration, cloud configuration and rollback copy instructions were not independently verified in this code-only review.

A 5–10-document Edinburgh PoC is appropriate on isolated resources. First test copying the originals while preserving existing IDs and embeddings, so old saved references can be tested; separately test a genuinely new upload through OCR/indexing. Include PDF, scanned PDF, email and spreadsheet if present. Acceptance: source checksums/counts; same project/doc IDs; old and new citations opening the correct page; restart/cold source hydration; upload/delete/retry; spreadsheet/canonical artifacts; and foreign-project access rejection. Use an isolated subset with verified ownership, not a broad filename fallback across projects. Keep the current store available until reconciliation and rollback are tested.

### Query latency work

Main's new BM25 SQL and background-build changes address real mechanisms: volatile-score filtering and a synchronous FTS build blocking a request. Our integration already fixes the score query with a materialized CTE and adds durable dirty-state/persisted-index reuse plus independent reader cursors. Main's warm-up forces a background build and adds a five-minute rebuild throttle; it does not contain those durable-state/reuse changes. Background warm-up can be considered as a small adapted follow-up, preserving existing dev behavior and testing concurrent uploads, dirty state after restart and fresh-document availability. Blindly replacing dev's `lexical_index.py` or `chunk_store.py` would remove tested integration changes.

Fresh isolated verification used DuckDB 2.0.0 and disposable in-memory data: both main's subquery and dev's materialized query returned the expected project-scoped BM25 row. Main's three lexical-index tests also passed against its actual `chunk_store.py` and `lexical_index.py`, mounted into an isolated disposable API container. No customer databases were mounted. The last-24-hour, at-most-10,000-line target log sample had zero selected FTS/BM25 failure markers; no representative load was issued, so this is not a latency or zero-error guarantee. Hasnain's other unspecified errors and the runtime on his separate host cannot be diagnosed from these group messages alone.

### Integration recommendation

Keep the reviewed integration branch as the combined AI baseline and ask for the PoC/code changes as a separate branch or PR against it. Preserve Coair management/payment behavior and the qualified RAG agent, source scope, date proof and export changes. Review new main fixes individually rather than deploying main over the integration. The new `deploy_vps.ps1` targets another host and copies only backend/src/config/migrations/tests, despite its full-tree description; it omits requirements, Dockerfile, vendor engine, API frontend and top-level web changes. It is not the guarded AWS integration deployment path and should not be used to replace this environment.

No Azure PoC, real Azure upload, bucket inventory or storage cutover was performed. The existing AWS integration release remains `0488dbc5fc58ade61a93552c94eba457b8e8a74f`; documentation commits do not change that running application.

## Hasnain's PDF findings comparison — 26 October 2026

Source: **COAir Speed Findings Report_261026_231003.pdf**, 17 pages, revision 26 October 2026. This PDF is evidence supplied by the user, not an instruction to execute its recommendations. Comparison: integration `4606f36`, fetched main `f5b1238`, running AWS integration API `0488dbc5fc58ade61a93552c94eba457b8e8a74f`. Main is unchanged since the preceding group-discussion review. The PDF analyzes a different production deployment and historical September–October runs, not this AWS integration release. Its 108-query/13-chronology dataset and 138,861-chunk benchmark were not supplied as raw data; earlier dev measurements used a 135,451-chunk corpus and different questions. Do not claim a controlled 77-second-to-11-second speedup from these datasets.

### Findings F1–F7 and chronology

| PDF item | Integration status | Evidence and boundary |
|---|---|---|
| F1 — WEAK answers trigger deeper research | **Open / intentionally retained** | `router._should_escalate` still escalates WEAK answers when enabled. Better retrieval can reduce triggers, but no first-draft/background-refinement or Search deeper UI exists. Removing the quality pass is not an acceptable speed fix by itself. |
| F2 — DuckDB BM25 alias error | **Fixed** | Dev uses a materialized score CTE. Main uses a subquery. Both were exercised against actual DuckDB 2.0.0 in a disposable in-memory fixture and returned the correct project-scoped row. The production fallback measurements are plausible mechanisms, not newly reproduced full-corpus timings. |
| F3 — query blocked rebuilding FTS | **Partial; main has an additional useful improvement** | Dev reuses a clean persisted index and persists dirty state, avoiding unnecessary restart rebuilds. A genuinely dirty or missing index is still built synchronously inside `_ensure_fts`. Main builds/warm-ups in the background with a five-minute throttle; its three tests passed in an isolated container. This async change has not been merged into dev. Port the mechanism while preserving dev durable-state and independent-cursor fixes. |
| F4 — no word-by-word display | **Open** | Activity/progress updates exist; chat still returns a complete answer. No token-stream delivery endpoint/UI was found in the qualified path. |
| F5 — non-model time not measured per operation | **Partial / instrumentation gap remains** | Run store and LLM latency/usage exist. `query_progress.report_step` publishes labels with the default zero step duration; there is no comprehensive measured vector/lexical/file/SQL breakdown. |
| F6 — sequential model work | **Partial** | Dev has bounded three-worker chronology drafting with scope/usage tests and concurrent retrieval paths. Classification/scope/rewrite and other dependencies are not all parallelized. This does not prove the PDF's 7.6-call average has been removed. |
| F7 — MAX_TOKENS / cut-off answer or SQL | **Partial** | `llm_client` records finish reasons, rejects incomplete responses and handles a zero-text thinking-budget exhaustion retry. Task profiles still bound chat output to 8192 and SQL to 4096 tokens; explicit smaller call budgets also exist. Rejection prevents silent successful truncation but can still fail or retry; the historical 13 calls have not been replayed. |
| Chronology failures / invalid structured output | **Substantially improved, not universally closed** | Schema/cardinality feedback stays inside the existing retry budget; claim/date proof, source preservation, checkpoint reuse and parallel drafting are tested. Two real full-corpus examples completed in approximately 141 and 155 seconds, including one successful schema-repair retry. These samples do not prove that all seven historical failures or every historical question are fixed; reports remain partial. |
| Old code silently restored on rebuild | **Addressed in integration deployment** | Immutable matching API/web commit tags, CI regression/build gates, readiness + authenticated smoke, recorded release and rollback to prior images. No hot-patching of running application files. Main's VPS script fixes one workflow but is not the integration release path. |
| Unpinned libraries | **Open except selected critical pairs** | Qdrant dependency pair is pinned and import-tested; `duckdb>=0.9.0` and several `llama-index>=...` entries remain broad. Immutable built images are reproducible deployment artifacts but do not lock fresh dependency resolution. |

### Further improvements A–P

| PDF item | Status in our branch/environment |
|---|---|
| A — UK spreadsheet dates | **Open, reproduced now.** The actual deployed image parsed `03/04/2010` as `2010-03-04` and `12/01/2011` as `2011-12-01`; `25/03/2010` remained March 25. Main and dev `table_normalizer.py` hashes are identical. Chronology quotation/date-proof repairs do not fix spreadsheet ingestion locale. A column/project-aware parsing policy and regressions are needed; a global day-first switch would risk US-format inputs. |
| B — review weak answers | Run data exists; a regular analysis/quality workflow is not established by this branch. **Open.** |
| C — visible uncertainty after failed deeper research | Verifier/escalation guards exist, but no dedicated reliable WEAK/limited-evidence presentation was found in the chat delivery UI. **Open.** |
| D — 30-day persistent logs | **Partial:** Docker JSON rotation is configured and running (`5m`, two files), but that is a size bound, not 30-day host-independent retention or central shipping. |
| E — broken auth/company suite | Selected org/commerce/auth contracts have fixes and regression evidence; passing the CI selection does **not** establish that the PDF's unspecified 42+11 failures are all fixed. Need the exact failing test list/environment for a one-to-one comparison. **Partial.** |
| F — tests before deploy | **Implemented for integration:** CI runs backend contracts, real PostgreSQL contracts, frontend tests and builds before deployment. Main's new PowerShell deploy script has no equivalent test gate. |
| G — ready rollback image | **Implemented with retention boundary:** release rollback exists and inspection found current + multiple prior integration API images. A guaranteed retention policy protecting a known-good image from every future global prune is not established. |
| H — scheduled working-database backups | Persistent volumes exist, and a separate pre-deploy backup script exists for the older stack, but integration release does not invoke it and no nightly integration DB backup/restore acceptance was established. **Open / unqualified.** |
| I — meaningful health checks | **Partial:** dependency/runtime validation and initializing/unhealthy 503 handling are present; no complete live FTS query + vector service operation + object-store probe exists. `vector_runtime=ready` denotes dependency validation, not a live query guarantee. |
| J — world-readable production `render.env.paste` | Report refers to `/opt/coair-api` on a different host. No root-level `.paste` was found in our `/opt/coair-integration`; external production finding remains **unverified/unresolved here**. No secret contents were opened. |
| K — secret/directory permissions | **Verified safe for the inspected integration paths:** root 0755; `api.env`, `compose.env`, `.access.json` 0600. This is not a verification of Hasnain's separate production host or every nested file. |
| L — retired Google SDK | **Open:** main provider path uses `google-genai`, but the guarded LlamaIndex Gemini wrapper still imports the legacy integration. Being lazy/guarded is not complete migration. |
| M — admin speed/quality dashboard | Run/usage data and admin controls exist, but the requested daily latency/weak-share/chronology-failure dashboard was not established. **Open.** |
| N — automatic operational alerts | **Open:** no alert behavior was added or exercised in this work. |
| O — chronology progress and partial recovery | **Partial:** stage/progress updates, durable report jobs, saved extraction/synthesis steps and retry reuse exist. Accurate document-count ETA and user-visible partial report delivery after failure are not qualified. |
| P — rank evidence before extraction | **Implemented in principle, completeness still a gate:** scoped relevance retrieval and adjacent-page evidence precede extraction; rank normalization and report contracts are present. Do not impose arbitrary document/output caps to achieve the historical speed target or infer exhaustive event coverage from ranking. |

### Main review and recommended order

Only the same two commits are newly on main: `771ad53` and `f5b1238` (six changed files). They implement BM25 SQL repair, background FTS build/warm, tests, an Azure guide and a VPS source-copy deploy script. They do **not** implement the PDF's remaining recommendations: UK spreadsheet dates, token streaming, uncertainty UI, dependency lock, database backups or the requested dashboard/alerts. Main's index tests pass, so those changes should not be dismissed; adapt background FTS narrowly instead of replacing dev files wholesale. The deployment script still copies only backend/src/config/migrations/tests, omitting requirements, Dockerfile, vendor and frontend; its full-tree wording overstates its scope.

Priority for a subsequent authorized fix pass: (1) UK dates with column/project locale and no US regression; (2) background FTS merged with persistent dirty-state/reuse and concurrent-upload tests; (3) deterministic dependency lock and exact MFA failure inventory; (4) real step timers and full-size representative benchmark; (5) isolated DB backup/restore and log/rollback retention qualification. Streaming and optional deeper research are product/quality changes, not automatic replacements for the proven RAG behavior. Keep answer quality, source/project scope and report coverage as release gates.

This review does not apply application fixes or change either production configuration. It records which claims are actually closed, partly addressed or still open.

### Fresh PDF-review verification

A disposable API container using the actual deployed immutable dev image ran the current branch's auth provisioning, organization API, commerce API, readiness, negative escalation, parallel synthesis, chronology date/schema repair, run-store and database-alignment tests: **98 passed in 127.34 seconds** (one unrelated PyMuPDF deprecation warning). Tests used isolated temporary stores and no mounted customer databases or real provider credentials. This is a focused regression result, not a claim to have run the PDF's unnamed 42 failing tests or the entire repository suite. The UK date probe above deliberately demonstrates a still-open defect and is not counted as a passing regression. Only this review document changed.

## First-pass retrieval, graph, glossary and main merge — 27 October 2026

### What actually causes the second research pass

The current verifier is narrower than the historical PDF's description: document/hybrid answers that do not read as denials return OK without the extra judge call. `WEAK` is principally a potentially false negative (a denial/no usable document sources); OFFTOPIC, file listing and already-agent routes do not start the second loop. A denial is judged from the question and answer, not proof that the complete library was exhausted. The deeper ReAct path can run up to four iterations/45 seconds/16 cumulative logged model calls, subject to individual call timeouts; the time check is between steps, not an exact 45-second wall-clock deadline. Dependent decide/tool/observation calls in that loop are necessarily sequential. Bounded chronology parallel drafting is a different execution path.

Removing the API container's RAM ceiling did not remove retrieval/model/agent boundaries. Live inspected values before this release: 30 dense and lexical candidates, rerank pool 15, configured final count 6; `DocumentRAG.query` defaults to 10 passages and normally overrides that configured fallback. These are passages/candidates, not a count of allowed library documents. ReAct default is five iterations/90 seconds; escalation has the separate budgets above. The 12-term/2000-character prepared glossary block bounds terminology, not corpus evidence. Provider context/output limits also remain. Unlimited whole-library synthesis would be neither equivalent nor a safe recall fix.

### Confirmed first-pass defects and surgical changes

1. Main's background FTS work conflicts with dev's `lexical_index.py`. The merge was resolved on `integration/rag-agent-parity`, keeping the materialized scoring query, independent reader cursors and durable dirty metadata while adding background warm/build. Clean persisted indexes are reused. Builds track a mutation generation so an upload/delete during a build cannot be marked clean by that older build; failed rebuilds keep a durable dirty flag. No changes were made to origin/main.
2. The first-pass metadata booster called `LightGraph.search_broad`, whose notices have no `project_id`, then rejected every node without that field. Graph contribution was therefore effectively absent for those records, rather than deferred deliberately until a bad answer. The fix derives owned IDs from the active project's chunk store, applies that allowlist in graph SQL **before LIMIT**, attaches only that proven project identity, and retains the defensive consumer filter. Missing/failed ownership returns no graph results. Foreign notices cannot crowd out an owned older notice. This enables a gentle first-pass ranking boost; it does not add a new full relationship-traversal GraphRAG engine.
3. Selected-document lexical candidates were capped globally and filtered by selection afterwards. Selection is now supplied to the project-scoped lexical query before its top-K limit, so other same-project documents cannot consume the entire lexical candidate budget. Existing postfilters remain as defense in depth.

The glossary is already used before first-pass retrieval, not only after WEAK: request-local prepared terminology, single-pass expansion, preserved original phrasing and semantic/concept variants. Existing bounded-expansion/scope tests passed; no glossary bypass or replacement was introduced. The demo-corpus lexical skip is still an intentional legacy corpus boundary and was not removed blindly. Metadata boosts can only help if notice metadata and project ownership inventory exist; a sparse graph cannot substitute for missing source ingestion.

### Verification and remaining quality work

Focused merge/first-pass tests: **63 passed**, covering main's lexical tests plus persisted-index reuse, dirty generations, nonblocking rebuild, real owned graph metadata, unavailable ownership, glossary bounds, escalation guards, selected-vector scope, preview isolation and readiness. The first trial had two test-harness/old synchronous-contract failures; the cursor spy now implements its context manager and the old build test exercises the background builder explicitly. They were repaired and the full focused selection rerun passed. CI now includes the new lexical and graph regressions.

This does **not** prove all weak-answer delays are gone. The agent rescue remains enabled to preserve quality. Before changing it, replay the exact historical slow/weak questions on a frozen corpus and record initial retrieval coverage, graph hits, stage durations, first-pass answer/denial, final answer adoption and citations. Compare against a quality-reviewed baseline, not elapsed time alone. The historical raw run-store corpus/questions were not provided here. Good next steps are an evidence-only scoped recall repair that reuses first-pass sources before full ReAct, and parallel execution only where dependencies are independent (dense/lexical/metadata). Classification/rewriting that depends on earlier output and adaptive agent tool rounds cannot be blindly parallelized. No Search deeper button or unchecked preliminary answer replaced the existing behavior in this patch.

Scope exclusions: UK spreadsheet date parsing remains open; Azure guide changes were merged as documentation, with no Azure cutover; the VPS script does not replace the guarded AWS deployment; DGX branch/device were not updated by this cloud merge.

### Additional real HTTP routing finding

The first merge/retrieval release `cf32fc0` passed CI (533 API tests + 13 subtests, three PostgreSQL contracts, frontend/build gates) and guarded deployment in run `40404762491`. During real public HTTP probing, the utility-role document question went through DATA, including when a PDF was explicitly selected; the earlier response had no direct chat citations. Run-store audit recorded a completed DATA route, not WEAK escalation. The selected repeat took 24.71 seconds. These failed citation probes are evidence against claiming complete parity and are not reported as passing speed comparisons.

The code documented selected-document classification bypass, but only implemented it for `email_ids`. A further narrow repair includes owned text-document selections whose extracted context exists, for both provider modes. Every selected record must belong to the current project and be PDF/DOC/DOCX/TXT/RTF. Spreadsheet-only, mixed spreadsheet/text, missing/foreign records or missing context keep normal SQL/hybrid routing. This avoids classification/model calls for an explicit source without disabling quality behavior for ordinary searches.

The extracted selected-text path also retains inherited 8000-character per-document and 16000-character total limits. Its prompt previously implied full document contents. The heading now explicitly describes potentially partial excerpts and permits combining them with retrieved selected passages, so a missing fact in the prefix is not evidence of absence in the document. The limits were disclosed rather than silently described as removed; replacing them needs a tested coverage strategy for long files.

Focused routing/context/escalation tests passed **37 tests + four subtests** before the heading-only clarification; the subsequent full CI covers that final source too. Real HTTP citation and honest-denial acceptance are rerun after deployment. Full-library routing with no explicit selection remains a separate measured quality issue; this patch does not force every numerical or mixed question into document mode.

### Confirmed glossary domain wiring defect and repair

Further semantic inspection found the bounded glossary was safe from recursive growth but **not fully wired to the project's domain**. PB has Performance Bond / Parsons Brinckerhoff senses; SDS has Safety Data Sheet / System Design Services senses. Chat preparation did not pass a project domain. Chronology's existing domain helper called nonexistent `ProjectStore.get_project`, caught the exception and silently used an empty hint. The tag parser also kept square brackets in its comparison value, defeating normal tag selection in several cases.

The shared hint now reads only the current/explicit project's name through the real `.get` API, without a cross-request cache. Domain-tag parsing removes brackets; a distinctive project/domain prefix supports labels such as Edinburgh — integration sample. Prepared retrieval and the two legacy expansion paths use the matching sense when project context is known. Unknown projects retain their previous conservative generic/first-sense behavior; HSE retains Safety Data Sheet. The same helper serves chronology. No dictionary entries, source evidence or accepted RAG generation/planner/style prompts were changed.

Focused glossary, selected routing, chronology and prompt-contract verification passed **98 tests + four subtests**. An initial run caught the bracket-selection defect, and an operator mount mistake made prompt-contract files unavailable; both were corrected and the complete selection rerun passed. These are new results, not an assertion that prior bounded-expansion tests proved semantic disambiguation.

The selected-routing release `18d2385` passed its complete CI and public deployment in `40405983590`. Two actual public API checks then passed with one correct selected-document citation each: utility-role question 10.75 s; explicit final-cost availability question 5.80 s. Both temporary conversations were deleted. These are small acceptance samples, not a controlled speed benchmark; the earlier selected probe's DATA route at 24.71 s was a delivery/routing failure, not a baseline of equivalent successful content. Final glossary release CI/deployment and the live chosen domain are checked separately.

### Final release and live acceptance — 27 October

Release `7adb12c46f39e8ce381d6a96b0d3d75269d9104e` passed [CI/deploy 40407050512](https://github.com/CoAirai/CoAIr/actions/runs/40407050512): **540 API tests + 13 subtests**, three actual PostgreSQL contracts, frontend/build gates and guarded public MFA/project/library/source-preview smoke. Immutable API image, healthy running state and Memory=0 were inspected after deployment. Remote main remains `f5b1238`; it is an ancestor of this integration branch. All application commits were pushed to the integration branch, not main.

The actual deployed glossary, with the active Edinburgh project set, now produces semantic query **Parsons Brinckerhoff and System Design Services contract** for **PB and SDS**, and the corresponding single-sense parenthetical expansion. This validates the real project-store lookup, not just a mocked domain name.

The two public selected-PDF probes passed again on the final release: utility-role answer **8.28 seconds**, final-cost availability answer **6.60 seconds**, each with one selected-document citation. Run-store audit shows both completed on the document route, with exactly two logged model tasks each (scope and document synthesis) and no ReAct escalation. The availability answer explicitly says the excerpt contains no final financial figure rather than inventing one. Temporary conversations were deleted; query audit records and private acceptance results were retained. Public requests use normal cache behavior and only the three-document sample project, so these are acceptance examples, not full-corpus comparative performance statistics.

The longer WEAK rescue remains available for ordinary searches. These patches remove confirmed upstream causes and avoid unnecessary selected-source classification; they do not establish a zero-escalation/zero-failure policy or full-library factual completeness. Replaying the historical weak/slow query set and measuring each retrieval stage remains necessary before making a general latency claim. The initial unselected DATA-routing failure remains recorded as a separate investigation item, not disguised as a passing run.

## Current remaining-work recheck — 27 October 2026

This status supersedes earlier historical OPEN entries where later fixes and acceptance closed the specific case. Re-fetched main is still `f5b1238`; deployed integration is still `7adb12c` with successful CI `40407050512`. This recheck changes documentation only.

### Fresh findings

- The previously failed **unselected** utility-role question was rerun through the real public API on the final glossary release. It now completed in **9.41 seconds**, DOCUMENT route, with **three project-document citations**. This specific routing reproduction is closed; broader intent/WEAK-set qualification is still needed. The earlier statement that this reproduction remained unresolved is superseded by this result. Normal caching and the three-document sample apply; this is not a production performance distribution.
- Four API test modules outside the selected CI gate were run in a disposable container with no mounted customer stores: auth flow, ops API, superadmin roles and Supabase username mapping. The unmodified combined run had **12 pass / 15 fail**. Tests share the global in-process login/MFA limiter and the same synthetic client address, so later tests consume earlier tests' quotas. Diagnostic isolation replaced the limiter with a fresh instance **per test only**, preserving rate-limit behavior within each test and leaving production unchanged. The isolated rerun had **26 pass / one fail**.
- The remaining failure is `test_ops_api.py::test_password_reset_and_invite`: its reset portion succeeds, then it expects an invited user to sign in immediately with `temporary_password`. The returned password is empty and the account correctly remains invited pending activation. The test needs the current invitation activation/code/password flow, rather than weakening production account-state checks. The PDF's unnamed 42+11 failures were not supplied as an exact list, so this is not a one-to-one closure of every reported test.

### Still open, with scope

| Priority | Remaining item | Meaning |
|---|---|---|
| High | UK spreadsheet date parsing | Confirmed and unchanged: ambiguous slash dates still take the month-first parser path. Fix by column/project locale with UK/US regressions; do not globally flip every input. Chronology quote-date proof is a different layer. |
| High | Whole-library and long-document coverage acceptance | Small real chat checks and partial reports do not establish that all relevant evidence is included. Selected context retains 8000/16000-character bounds and retrieval uses candidate/passage budgets. A coverage strategy and long-file evidence tests are required, not arbitrary blanket limit removal. |
| High | Historic WEAK/slow query replay | Rescue remains enabled. Measure the original slow/weak cases with frozen inputs and per-stage timers before claiming the long second-pass problem is eliminated. The new unselected probe passes, but one question is not the full set. |
| Medium | Reliable complete test discovery and CI inclusion | Add per-test shared-security-state isolation and update the stale invitation test; include these additional auth/ops/role modules in the required gate. Existing 540-test CI is a selection, not every repository test. |
| Medium | Reproducible dependency resolution | DuckDB and several LlamaIndex requirements still allow broad versions. Immutable deployed images protect a release but do not lock a fresh rebuild's dependency selection. |
| Medium | Detailed non-model timings | Activity labels exist; the ordinary progress publisher still records default zero step durations. Vector/lexical/file/SQL work needs measured timing. |
| Medium | MAX_TOKENS recovery qualification | Incomplete output is rejected and finish reasons are tracked; bounded task budgets and provider failures can still cause retry/failure. Historical truncated answer/SQL cases were not replayed. This is remaining qualification/hardening, not evidence every current answer is truncated. |
| Operational | Working-database backup and tested restore | Persistent volumes and rollback code exist, but integration scheduled backup/restore acceptance is not established by this repo/work. A standalone older-stack backup script is not proof of a nightly integration job. |
| Operational | Log retention, known-good image retention, dependency health probes | Current JSON rotation is 2 × 5 MB, not a 30-day retention guarantee. Previous images currently exist, but future prune protection needs policy. Runtime readiness is not a complete live vector/FTS/object-store probe. |
| Product/observability | Token streaming, explicit limited-evidence status, latency/quality dashboard and alerts | These features remain absent/unqualified. Their absence is distinct from a newly reproduced processing bug. Preserve evidence checks when implementing them. |
| Production acceptance | Complete document inventory/OCR lifecycle and live email/payment/storage-provider flows | The isolated test hostname has three sample documents and disabled production outbound providers. Full-corpus native QA does not migrate the full library or qualify a real provider cutover. Azure is still a guide, not a completed integration. |
| Separate host | Reported plain-text secrets file / permissive production folder | Our inspected integration secret files are 0600 and directory 0755; the PDF's separate production host still needs its owner's verification. Do not mark that external finding closed from this AWS check. |

Already repaired in this branch: DuckDB score query; nonblocking FTS with durable reuse/dirty generations; first-pass owned graph metadata; project-domain glossary and chronology lookup; owned selected-text routing; reviewed report date/schema recovery; guarded immutable deployment/CI. Do not ask another developer to repeat those historical fixes blindly. A suitable independent work split is UK dates, the diagnosed test-fixture/activation updates, dependency locking and operational backup/log acceptance, all based on the integration branch.

## Long evidence and dependency baseline — 27 October 2026

This change applies to the qualified cloud V2 pipeline and the integration chat/forensic paths. Experimental V3 and the offline DGX appliance are not newly qualified by this release.

- Selected-document chat no longer reads only the first 8,000 characters or stops visiting later selected files when its supplemental context fills. It streams all owned selected pages, ranks overlapping passages against the question, and retains a small 16,000-character supplemental window. Project/selection-scoped semantic and lexical retrieval still runs. The window explicitly identifies itself as a partial reading; this is not an assertion that every selected page was sent to the model.
- V2 chronology removes the 500-selected-document request ceiling, the final 400-passage retrieval cut, the 240,000-character total extraction pack cap, per-file share caps, repeated-date saturation stopping, and the prompt/schema quota of 18 events per extraction call. Explicitly selected evidence is all admitted; automatic discovery still uses relevance-ranked, project-scoped retrieval and coverage repair. A full-project exhaustive read is not implied by automatic discovery.
- Evidence extraction stays within 80,000-character batches and runs at most three calls concurrently. Checkpoints, source identity, independent factual/date verification and partial-coverage reporting remain. Event synthesis keeps its bounded batches and must preserve every cluster. The overview reduces bounded source-backed summaries instead of reloading the entire long report into one prompt; it does not reduce the detailed event list.
- Forensic evidence is also processed in bounded 80,000-character JSON batches, with at most three simultaneous provider calls. Oversized source excerpts use overlapping windows with their original source identity. Supported section claims merge deterministically with exact duplicate removal; the Word document retains its nine-section layout and real footnotes. This change does not introduce a new forensic semantic verifier or certify every cross-document conclusion.
- `api/requirements.lock` captures the complete installed dependency closure of the qualified AWS API image `7adb12c46f39e8ce381d6a96b0d3d75269d9104e` (CPython 3.11/Linux amd64), whose `pip check` passed. `requirements.txt`, Docker wheel/build/install stages and CI use that closure. Test tooling is separately pinned. A runtime contract test checks installed versions against every lock entry. Existing npm lockfiles and `npm ci` remain in use. This establishes a tested library baseline without an incidental SDK upgrade; it is not a platform-independent or hash-verified OS/model lock.

Provider context/output limits, account credits, bounded concurrency and request timeouts remain. Reading more relevant material can require more calls, time and credits. A failed provider call must not be disguised as successful full coverage. Actual full-library completeness and a production latency distribution remain separate acceptance work.

Regression coverage includes an answer on page 200 of the thirtieth selected file; a competing foreign-project file with the same name; ambiguous legacy filename rejection; more than 600,000 characters sharing the same date; all 100 events reaching a real Word document including the final event; bounded hierarchical overview prompts; oversized forensic evidence reaching its final fact; and 1,000 selected IDs accepted by the report request model.

Targeted disposable-container validation: **142 passed and 13 subtests passed**; `pip check` passed and all runtime lock versions matched. These include controlled model stubs for very large synthetic reports; live provider/report qualification is recorded separately below.

### Graph/metadata readiness — live inspection during the long-evidence release

The graph is **not qualified as an exhaustive report-discovery mechanism**. On the inspected integration runtime, `EVENT_INDEX_ENABLED=False` and `CHRONOLOGY_EVENT_DISCOVERY_MODE=audit`. Public project-scoped event-index status/metrics return zero indexed documents, observations and clusters and `complete=false`. Audit mode is not a populated event-memory retrieval path.

The global legacy document-graph artifact contains **7 nodes and 6 directed edge records**, all `references`; these are not seven indexed documents in every project or six independently verified event relationships. Of these global nodes, 5 have dates, 4 reference numbers, 3 topics and 1 a contract reference. None stores `project_id`, sender, recipient or subject. A missing sender/recipient can be legitimate for a witness statement or contract; document-type-aware assessment is required before calling it an extraction error. Active graph search derives allowed document identities from project-owned chunks; a text-derived `project_name` must never become a tenant identity.

Relevant implementation findings:

- `light_graph.py` builds document links from references, party overlap, topics, contracts and reciprocal sender/recipient/date heuristics. Its edge `why` is an algorithmic explanation, not an evidence-span verification. Similar topics or reciprocal parties must not be promoted to proven causation or a confirmed reply.
- `notice_extractor.py` was optimized for English construction correspondence. The generic document index infers title/reference/date/family mainly from early text; later substantive events need the separate event-memory layer. Legacy cached notices are not automatically regenerated merely because extraction code changes, and startup graph rebuild only runs when the graph is empty.
- Existing `canonical_artifacts.segments_from_legacy_chunks` and `scripts/backfill_master_events.py` support reuse of extracted page/chunk text. Good OCR, document files and embeddings do not inherently need to be recreated for metadata/event enrichment. The script groups by `(project_id, doc_id)` and defaults to dry-run. It must operate against an intentional snapshot or the owning application process: opening the live DuckDB writer from another process can otherwise fall back to an empty in-memory store and give a misleading zero-document result.
- `master_event_store.py`/`event_memory.py` already provide project-scoped versioned source segments, observations, clusters, candidate relations, quote offsets/hashes, date-role evidence, actor spans and jargon resolutions. These are a better existing foundation for the pilot than replacing storage with another graph database. They still require recall tests: undated candidate discovery uses trigger heuristics and a bounded set of trigger positions; a successfully built index is not proof that every material event was found.

Controlled enrichment sequence:

1. Freeze the current source/citation identities; measure field applicability, source coverage and date quality per document type. Do not invent metadata to raise a fill-rate.
2. Use a project-scoped, stratified sample of existing extracted text: short/long files, native/OCR, letters/statements/contracts/tables, dated and undated material. Version the enrichment by content, prompt/schema and jargon hashes. Repeat OCR only for independently identified unreadable/missing pages.
3. Validate exact source quotes, page/row locators, date role and normalized parties/aliases. Relationship expansion must enforce project ownership before traversal and preserve an explicit file selection. A graph link is a discovery lead until its evidence is checked.
4. Compare event-memory plus dense/BM25 fallback against the same accepted questions/reports. Measure missed material events and counter-evidence, invalid links/dates, provider input tokens/calls, elapsed time and citation accuracy. Require no cross-project result and no lost accepted event. A higher node/edge count is not an acceptance criterion.
5. Expand only the successful pilot in resumable, bounded background jobs; reprocess changed/missing derived records rather than the full library. Keep the existing retrieval path available until recall and source-quality checks pass.

No full-corpus re-ingestion, graph rebuild, event-worker enablement or graph-first production cutover was performed by this inspection. The long-evidence batching improvements stand independently of this still-unqualified graph enrichment.

Live reference RAG graph inspection returned 77 nodes and 1,304 edge records (dates on 73 nodes, sender on 56, recipient on 63, subject on 49, references on 34, topics on 77; no stored `project_id`). The two deployments do not contain the same graph/source inventory, so these counts do not establish a migration loss or a report-quality comparison. Neither graph-node count is a full-project recall guarantee.

### Deployed qualification

- Source commit `0fae0f96d4ac4245e8c67def34856d23f501e927`, integration CI/deploy [40503820605](https://github.com/CoAirai/CoAIr/actions/runs/40503820605): successful. **575 API tests plus 13 subtests**, **3 real PostgreSQL adapter tests**, locked dependency resolution and `pip check`, existing web build/test step and guarded deployment passed. The API immutable image matches this commit.
- Real public API report on the three existing Edinburgh test documents: job `c0063aee68e94429b1e7`, **57.75 seconds**, 13 entries including the overview, 8 evidence passages / 15,813 characters, 39,087-byte Word file with real footnotes. Observed queued/planning → extraction → synthesis → verification → ready progression. Coverage remained **partial** with `uncovered_facets`, correctly reflecting the sample evidence. This is a small live-provider functional check, not a 600,000-character live-provider benchmark; large-pack/100-event preservation is covered by the controlled regression fixtures above. No comparison to previous runs on different evidence is claimed.
- Post-deployment selected-document chat probes: the utility-role answer returned in **9.40 seconds** with one citation; the unsupported-total-cost question returned a clear denial in **4.65 seconds** with one citation and no invented amount. Both cited the selected project file; temporary QA conversations were deleted. The public payload did not expose a route value in these probes, so a route/call-count conclusion is not inferred. Normal caches and the small sample apply.

## Found-source reading and evidence coverage — controlled implementation

Work branch: `codex/long-document-evidence`, based on tested integration `4da17dc`. At the start of this work, remote main remained `f5b1238`; the integration changes had not yet appeared on main. This branch leaves Hasnain's merge source unchanged. CI builds/tests the feature branch. The regular automatic release remains on the integration branch; a feature qualification release requires the exact commit in `INTEGRATION_QUALIFICATION_COMMIT`, which is cleared after qualification. Integration deployments share a release lock.

1. **Reproduce before changing:** three real in-memory DuckDB regressions fail against deployed `0fae0f9`: a relevant fact after the clipped passage prefix, a neighbouring page of the 75th found document, and a same-name unselected file admitted by the old filename-OR identity predicate. All three pass after source expansion.
2. **Read found sources in bounded windows:** hydrate all distinct found document/page ranges from project-owned mirror rows; merge overlapping ranges, eliminate the global first-60-neighbour cut, prefer original text to display snippets, and split long text into 3,500-character windows with 200-character overlap. Stable source IDs include chunk/offset/content and retain exact page locators. Filename equality never widens the SQL identity. A legacy alias needs a unique project registry identity before entering an explicit selection. No OCR, vector rebuild or provider migration is required.
3. **Track coverage and avoid repeat work:** a metadata-only evidence ledger records source identities, pages, content fingerprints, retrieval hits/errors/timings and source hydration completeness. One targeted retrieval round searches missing chronology facets rather than restarting the whole research process. Keyword facets are discovery signals, not a recall guarantee. Missing source text and failed retrieval lanes keep coverage partial. The existing Word generation, factual/date verifier and bounded synthesis remain in place.
4. **Reuse only eligible extraction candidates:** completed reports may supply an identical extraction batch for the same user, project and pipeline version. Hashes include exact evidence, actual extraction topic/parties, model, prompt, schema and jargon version. Cached entries must pass schema/source checks again, and empty/invalid batches are re-extracted. Final synthesis and independent verification remain job-local. This is candidate reuse, not a claim that every cached extraction was independently proved correct or complete. Added sources can invalidate a batch; an unchanged batch can be reused even if its step number moves.

No account, organization, payment, token-accounting or document schema was replaced. No new dependency is introduced. Broad semantic/lexical discovery still uses bounded per-query candidate pools; there is no claim of exhaustive automatic corpus coverage. Interactive chat's existing deep-agent retry and universal MAX_TOKENS continuation are not rewritten by this report-source change.

Targeted validation: 130 tests passed after coverage/cache integration; an additional focused run of 8 tests passed for model/jargon/query invalidation, corrupted cached claims, cross-user/project/version isolation and legacy alias scope. The old extraction checkpoint fixture had an invalid event with zero claims; it now uses an actually source-grounded event to exercise legitimate reuse instead of requiring acceptance of invalid cache contents.

Qualification edge cases added before final release: automatic search can hydrate an obsolete vector ID through a unique, project-owned canonical mirror ID without trusting the obsolete preview at an unproven page. Expanded spreadsheet chunks retain sheet/row locators only when they match the exact retrieved chunk; neighbouring chunks cannot inherit another sheet's locator. The final focused package passes 58 tests. The first feature CI run passed 587 API tests plus 13 subtests, 3 PostgreSQL tests and 169 web tests; a follow-up CI/release covers these final two regressions as well.

The first real repeat exposed an additional cache miss: the identical preparation and identical evidence-ID set arrived in a different relevance order, changing the extraction input hash. This was not counted as successful reuse. Extraction now canonicalizes the full chosen evidence by file/page/source identity before forming bounded batches; ranking still selects the evidence upstream and no source is removed. A reversal-order regression verifies one provider extraction across both orders. The focused package including parallel synthesis passes 61 tests. Live qualification of this correction is recorded below.


### Live qualification of the found-source changes — 27 October 2026

Deployed code: `2cef22016df0bd898fee82457f0709f316794d01` on `https://coair-test.duckdns.org`; API and web use that exact immutable tag. [CI and qualification deployment](https://github.com/CoAirai/CoAIr/actions/runs/40541807758) passed: 590 API tests plus 13 subtests and 3 PostgreSQL adapter tests. The web image retains the previously qualified 169-test build (unchanged UI inputs). The exact-commit qualification pin was removed after deployment. This does not move main, the existing integration merge source, the reference RAG service, or Hasnain's VPS.

The live project contains three Edinburgh PDFs, not the complete reference corpus. The automatic-discovery runs used the same topic; the two final runs used the same frozen preparation and identical eight evidence passages (15,813 characters, three documents). Word downloads have real footnotes, and all returned evidence document IDs belong to this project.

| Run | Total observed time | Entries including overview | Reused extraction batches | Result |
| --- | ---: | ---: | ---: | --- |
| Before source changes (`0fae0f9`) | 45.5 s | 10 | unavailable | partial |
| First qualification before stable ordering | 57.9 s | 12 | 0 | partial |
| Repeat before stable ordering | 39.5 s | 7 | 0 | partial; genuine reuse miss |
| Final code, first run | 36.4 s | 6 | 0 | partial |
| Final code, identical preparation repeated | 48.7 s | 6 | 1 | partial |

The reuse acceptance criterion passes: the final repeat skips provider extraction for one identical batch while final synthesis and verification run again. It does **not** demonstrate a latency improvement: synthesis took longer on that repeat. These are individual observations, not latency percentiles. Both final runs had zero unresolved source owners, locators or unread previews, and two retrieval rounds (initial discovery plus one targeted missing-facet query). No passage was dropped by the extraction batch budget. Two real chat checks also passed: source-grounded utility responsibilities (8.84 s) and refusal to invent an unsupported total cost (5.57 s).

**Content-quality acceptance is not passed.** Manual comparison found fewer distinct programme-target occurrences in the final report than in earlier runs, despite identical available evidence. Both final reports had zero populated event-date fields. An earlier report had six dated entries. Event count alone is not a quality metric, but the missing supported programme targets and dates require correction before recommending this feature for a customer release. Stable ordering makes extraction reuse deterministic; it cannot make a thin extraction complete, and can reproduce that thin candidate set.

Step-store inspection localizes one date loss: synthesis proposed `2007-03-15` with a quoted source passage but `date_source="text"`; the guard accepts only `content_header`, `content_body`, `table_period`, or `unresolved`, so the date was cleared. Another proposal for `2008-10-20` quoted only `On 20th October`, without a supported year; clearing that date remains correct. Do not relax date provenance to repair this. The model schema currently permits arbitrary strings for `date_source` while the prompt/guard require fixed values. Extraction already produced unresolved dates in its saved candidate set; synthesis alone is not the whole cause.

Next controlled corrections, with separate before/after checks:

1. Constrain generated date provenance to the actual allowed values and preserve exact source date quotations. Add a regression for the observed `text` mismatch; reject invented years and metadata-derived dates as before.
2. Audit extraction coverage against distinct, source-supported occurrences in each document/window, not only keyword facets or total entry count. Use programme targets, the planned June 2007 agreement, and contractual responsibilities as source-reviewed fixtures. Repair only missing occurrences with bounded source windows; do not restart unrestricted research after a weak draft.
3. Reject or repair incomplete cached candidate sets using that coverage check. Existing schema/source validation proves structural eligibility, not exhaustive recall.
4. Repeat identical-preparation reports and then qualify a genuinely large, project-isolated corpus. The three-file staging sample cannot certify thousands of documents, OCR intake, every source viewer path, or full RAG quality parity.

Reproducible server artifacts remain under `/opt/coair-integration/qualification/four-stage-review`: `coverage-report-probe.py`, frozen `results/coverage-preparation.json`, `results/coverage-metrics.json`, corresponding `long-evidence-coverage-*.json`/`.docx` files and stage logs. Final jobs: `249aa63294bf4df48499` and `d7f7bb666f5c4d409494`. The pre-order repeat failure is retained rather than presented as a successful cache benchmark. Qualification-only source expansions are removed after retaining their diagnostic test logs.


### Continued occurrence/date corrections — 27 October 2026

The first continuation CI run (`40559276452`) correctly blocked deployment: 593 tests passed and the accepted-prompt checksum test failed because the chronology instructions were intentionally changed. The guard remains in place. Prompt acceptance is reviewed against actual Edinburgh evidence and the new source/date regressions before recording a new checksum; this failure is not treated as a successful release.

Implemented changes:

- The provider JSON schema lists only supported date provenance values. PDF/OCR whitespace wrapping can no longer erase an otherwise exact quoted date. The actual source words and year remain mandatory; metadata dates and invented years remain forbidden.
- Independent extraction uses page-scoped windows with a 12,000-character per-call budget. A document count or event-count cap is not introduced. Explicit `Complete by ...` programme rows are divided with their preceding task wording; every original character is retained. This makes each target receive attention without restarting whole-corpus research.
- Exact schedule wording can restore a missing target date only when the event's own claim repeats that date and the same cited window has one explicit target. End/mid-month targets retain month precision. Different proposed dates stay unresolved. Final independent verification still applies.
- Drafting preserves dates already proven against the cited candidate. The verifier separately assesses the date link for individual claims in mixed dated/background events. When the combined date is rejected but a proper subset is independently dated, the renderer keeps that subset dated and preserves the remaining supported background in an undated entry. No factual claim is discarded to rescue a date.
- Changed prompt, schema, source windows and extraction policy invalidate the previous candidate cache. Unchanged new windows remain reusable for the same user/project/version, including after adding another document. Drafting and verification remain job-local; account, payment, role, database and dependency schemas are unchanged.

Focused validation passes 95 tests plus 9 subtests, including source windows, cache scope, recursive failure handling, full Word delivery, individually verified dates and long-evidence regressions. The recursion fixtures now place multiple chunks on the same page so they still exercise a real split after page isolation.


Pre-release prompt acceptance: isolated provider qualification uses the real three-file Edinburgh evidence and the production extraction/synthesis/independent-verification/Word functions, with production databases unmounted. The final reviewed run completed in 79.34 seconds, producing 23 entries including overview and 12 dated entries. All nine source-reviewed checks passed: phased transition, planned June memorandum, MUDFA programme targets, scope transfer, post-V31 incorporation, mobilisation review, January changes and February misalignment. These checks establish retention of the reviewed occurrences, not exhaustive material-event recall. `occurrence-provider-final.json`, `.docx` and `occurrence-provider-acceptance.json` retain the results. The accepted prompt checksum is updated only after this output review; historical source manifests remain historical. Authenticated staging and repeat/cache checks follow the full CI release.


Final source review also found conflicting OCR day tokens (`1st 11 April 2007`). A new negative regression rejects interpreting the trailing `11 April 2007` as an exact proven event date; a source-proven April 2007 month remains admissible. This is conservative source validation, not an OCR correction or an asserted alternative day. The earlier reviewed output is not evidence for accepting that exact day. The extraction policy changes to invalidate earlier candidates, and source/date checks remain active on reuse.


Authenticated qualification of `4b8545c` passed CI (600 API tests plus 13 subtests, 3 PostgreSQL adapter tests) and Word delivery. The first report took 100.21 s with 24 entries including overview; its repeat took 57.73 s with 22 entries. Source review found the January and February targets present despite overly literal keyword checks, but the June memorandum remained undated in that run. A final continuation restores a prose date only when the claim and its own cited source repeat the same date wording; conflicting date alternatives remain unresolved. A negative per-claim temporal decision now overrides a positive whole-paragraph decision. Both cases have regressions; the focused suite passes 99 tests plus 9 subtests. Final authenticated qualification reuses the same frozen preparation so this comparison does not depend on a new research plan.


The first `55ef99f` authenticated run exposed a real regression in the OCR narrative guard: a bad April date caused a different, valid March meeting sentence on the same page to be rejected. The final correction limits the rejection to the conflicting day/month/year pair, and matches equivalent ordinal wording using the actual source quotation (`15th March`, not a fabricated quote). The new regression proves both retention of the March meeting and rejection of the ambiguous April day. The focused suite passes 100 tests plus 9 subtests. This live failure is retained in the qualification artifacts; the earlier output is not claimed as full acceptance.


### One source-local claim repair after verification

The `ba6219c` first report retained all nine reviewed dates, but its repeat rejected the memorandum wording: `formally executed` could imply completion although the source requires future execution. Reusing extraction does not prevent drafting/verification variation. The pipeline now attempts **one** local repair of rejected factual wording (or an explicitly stated date rejected by the semantic verifier). It sends only the rejected claims and their own existing citations, in small batches. It never re-runs retrieval, graph search or the research planner. Unsupported replacements remain rejected and keep the report partial.

`chronology_claim_repair.py` requires one replacement/null per original claim reference; disallows new source IDs, counter-source IDs, unsupported numbers and quotations; and independently verifies every admitted replacement and its date. Planned/required/scheduled acts remain prospective. Job-local checkpoints include the exact repair instructions, models, base prompt, jargon, original draft, decisions and relevant evidence. Final repair output is not reused across users/jobs. Provider/auth/credit errors still propagate; malformed repair output cannot trigger an unlimited loop. The UI displays `Checking rejected claims` in English.

A replay of the actual rejected report (same saved draft and source evidence, production databases unmounted) repaired two claims in 5.65 seconds, with one independently verified date and zero unresolved repairs. The memorandum became `to be formally executed ... in June 2007`, and both its factual and temporal checks passed. The result is retained as `source-local-repair-review.json`. No generic research restart was needed. Split dated/background entries now have separate audit counts; they no longer produce a negative removed-event count.


### Final qualified release of this continuation

Runtime commit: `c751b3a025949fb6e4479ed156a021a870a0d272`, deployed as matching API/web immutable images on `https://coair-test.duckdns.org`. [Full CI and deployment](https://github.com/CoAirai/CoAIr/actions/runs/40569366113) passed **611 API tests plus 13 subtests, 3 PostgreSQL adapter tests, and 169 web tests**. The additional reviewed repair-instruction fingerprint passes the complete 33-case prompt protection check against that deployed image. This final fingerprint/documentation change is test-only; runtime code stays on the qualified commit. The qualification release pin was cleared.

The long-running older preparation correctly expired with HTTP 409. It was refreshed through the normal source-preview API. The final pair below uses one new frozen preparation, the same three project-owned Edinburgh PDFs, eight evidence passages and 15,813 source characters. Neither expired preparation nor an earlier failed content check is counted as acceptance.

| Current release run | Time | Entries including overview | Dated events | Reviewed source occurrences | Extraction reuse |
| --- | ---: | ---: | ---: | ---: | ---: |
| First, `eee0dabd4b3947c89f19` | 106.21 s | 22 | 11 | 9 / 9 | 0 / 16 batches |
| Repeat, `c0b5b1d31d064cbab015` | 78.99 s | 26 | 11 | 9 / 9 | 16 / 16 batches |

Both reports retain the March meeting, planned June memorandum and the seven reviewed programme targets with their source-supported dates. Source review confirms no invented 1/11/18 April event date from the conflicting OCR tokens, and PB's contractual responsibilities remain present. Word downloads contain real footnotes and references; all evidence IDs are among this project's three owned document IDs. Independent drafting/verification produces a different paragraph count, but the nine reviewed occurrences survive in both. These two reports needed no claim repair; the actual saved rejected wording separately exercised that path successfully (two claims repaired in 5.65 s, both independently checked, one verified date). The pipeline therefore avoids extra repair calls when the first verification accepts the wording.

Real chat regression checks on this release passed: source-grounded responsibilities in 9.45 s and refusal to invent an unsupported total cost in 4.80 s. These are individual observations, not latency percentiles or a universal SLA. Reusing extraction avoids that work; model drafting and independent verification can still vary in duration.

**Qualification boundary:** both reports remain `partial`, with `uncovered_facets`, `master_event_no_hits` and `master_counter_evidence_gap`. The three-file sample and empty master-event index do not prove exhaustive retrieval over the native 7,289-file reference corpus. This continuation closes the reproduced clipping, occurrence attention, date-loss, OCR spillover and rejected-wording cases; it does not certify every corpus, OCR intake path or all RAG/Coair quality as equivalent. No customer/organization/role/payment schema or runtime dependency changed, and no production RAG, dental or DGX deployment was moved.

Current reproducible artifacts are in `/opt/coair-integration/qualification/four-stage-review`: `results/current-qualification-summary.json`, the two `long-evidence-source-local-current-*.json`/`.docx` reports, their occurrence-review JSON and stage logs, `coverage-metrics.json`, and `source-local-repair-review.json`. Intermediate downloaded Word copies from this continuation can be recreated from retained JSON and were removed after verifying current Word output; application originals and saved job checkpoints remain intact. Temporary source overlays/test containers were removed after retaining test logs.

## Dependency, output-budget and DGX readiness audit (2026-10-27)

Measured on AWS before changes: 7,818 MiB physical RAM, 3,778 MiB available,
1,385 MiB swap in use. Coair integration API RSS/container working set was about
929 MiB; web 83 MiB and Qdrant 24 MiB. This is an idle snapshot, not a peak-load
certification. The API has no container RAM cap; DuckDB is separately budgeted
at 1 GB/one thread. Physical memory, concurrent OCR/report work and other services
still matter. Removing a container cap does not make memory unlimited.

The existing Python closure passes `pip check` on amd64. Both Node builds use
`npm ci` and committed locks. No broad library upgrade is warranted. ARM64
binary-only dependency resolution fails at the pinned hdbscan 0.8.44; the existing
API Dockerfile already has a disposable compiler stage for this situation.
Native ARM64 build/testing is required before calling that closure portable.
A dedicated ARM64 CI workflow now performs this check using the same Dockerfile,
plus installed-lock, vector adapter, OCR executable, Word/Excel and model-output
checks. DuckDB FTS is installed during image build rather than relying on a
runtime extension download. No alternate unpinned DGX requirements were added.

Chronology retains 12K-character extraction windows, 16,384 output tokens per
extraction call, 12-event synthesis batches at 32,768 output tokens and verifier
batches of 30 claims at 8,192 tokens. These are finite per-call budgets, not a
whole-report length/event/document cap. The stored model capability table is an
application configuration, not a fresh provider capability certification.

A reproduced OCR gap was fixed: multimodal generation previously returned text
without rejecting `MAX_TOKENS` or other incomplete finish reasons. It now applies
the task's output cap and request timeout, records actual paid usage, then rejects
incomplete/empty output. Selective OCR can retain its existing local fallback;
truncated model text cannot silently replace the page. Four mocked provider
regressions cover successful, capped, blocked and empty output, including usage
accounting. This does not add an unbounded continuation loop.

Tailscale reports `spark-9631` / `100.91.121.116` offline (last seen three days
ago). Device-side build, GPU/physical memory measurement and end-to-end acceptance
remain pending. The older CoAIr-fixes DGX installation uses vLLM; this branch's
primary text provider policy accepts Gemini/ZAI and otherwise selects Gemini.
Copying the old launcher would therefore silently change its intended execution
mode. New `deploy/spark/compose.yml` explicitly qualifies this branch on ARM64
with its current Gemini workflow, isolated volumes and no production DB/payment
endpoints. It does not claim local-model support or migrate customer accounts.
Full local-vLLM support requires a separately validated provider adapter, actual
model context/output capabilities, structured-output tests and report-quality
comparison. The cloud-backed device application and fully local inference are
different acceptance milestones.

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

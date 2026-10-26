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

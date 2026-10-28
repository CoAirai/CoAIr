# Four-stage RAG alignment acceptance

Reference: AWS RAG. Target: `integration/rag-agent-parity` on the isolated Coair hostname.
Production RAG, the production Coair branch, UI layout and payment rules remain outside the change target.

1. **Agent orchestration:** port bounded parallel synthesis; verify source ordering, failure propagation, resumable steps, tenant identity and durable cost/run attribution.
2. **Conversation context:** port selective bounded follow-up memory; run the same context contract against both repositories, including explicit source selection and standalone questions.
3. **Database:** retain Coair's organization/auth/accounting schema; validate relational ownership, concurrent accounting, DuckDB reader/index persistence and Qdrant project boundaries. Exercise a disposable PostgreSQL database if the existing adapter supports it. No wholesale live DB replacement.
4. **Query duration:** use identical source data, query, model and settings in isolated runs; record wall time, calls, tokens, citations and errors. Separate first/warm runs and report sample size. Small-corpus results do not establish full-corpus latency.

Each stage records its tests and any unresolved limitation below before advancement.

## Results

### Stage 1 — passed

Bounded three-worker synthesis is ported. Isolated API-image execution passed 57 tests and 9 subtests, including simultaneous worker scope, three separate durable charges, run token totals, ordered results, cached-step reuse and provider-failure propagation. No payment-rule changes. Durable run/ledger rows remain the source of aggregate usage; deprecated thread-local call counters are not an authoritative total.


### Stage 2 — passed

Coair now uses the RAG selective follow-up policy: last two messages, at most 3,000 characters, only for referential questions. Standalone queries omit unrelated history. Coair passed 26 tests and 4 subtests (including source-context restoration and both provider modes). The same executable memory and document-follow-up contract passed 14 tests against the actual RAG orchestrator source in an isolated dependency image. Production files were not edited. End-to-end performance qualification follows in stage 4.


### Stage 3 — passed

Retained the existing storage engines and Coair ownership/accounting model. SQLite qualification passed 101 tests. The same three new database contracts passed against actual disposable PostgreSQL 16: all nine migrations and safe reapplication, membership/persistent project ownership, concurrent CA increments, idempotent ledger entries, and rollback. Existing DuckDB cursor isolation/durable FTS and Qdrant project filters passed. Three obsolete organization-test calls were updated to supply the required `created_by`; production management/payment implementation was unchanged. PostgreSQL migration/contract execution is now a required CI gate. Supabase-hosted network/RLS roles, external buckets and the full production corpus remain outside this local-adapter qualification.


### Stage 4 — completed, with measured quality limits

A matched dataset was exercised through both actual orchestrators in disposable
containers, with native account schemas, the same three PDFs/eight chunks/eight
vectors, Gemini 3.6 Flash, BGE, one CPU and 1,536 MiB. Provider-response caching
was disabled; native router/retrieval caches remained enabled. Each chat case ran
twice. Initialization, HTTP/TLS and corpus conversion are outside request timing.

| Actual chat case | RAG mean seconds | Coair mean seconds | Repeats per engine |
|---|---:|---:|---:|
| Selected-document answer | 17.700 | 12.253 | 2 |
| Referential follow-up | 10.101 | 8.338 | 2 |
| Standalone question after history | 15.005 | 15.425 | 2 |

Both engines completed six responses. Coair passed all six structured citation
and explicit document-selection checks. RAG passed two: both selected-document
answers had citations in their prose but no structured citation chips, and both
follow-ups returned extra documents. These reference regressions are recorded,
not relabeled as passed. The target's canonical `file_id` selection fix passed
41 focused regressions/4 subtests, including a real local Qdrant adapter query.

Both generated valid narrative Word files with resolving footnotes: Coair 30.225
seconds, 4 records including overview, 10 footnotes; RAG 44.578 seconds, 14 records,
22 footnotes. Both are partial; the Coair sample additionally flags `thin_record`.
Different event coverage and one report per engine do **not** establish equal
content quality or a speedup. Earlier target runs also varied in coverage.
Full-corpus ground-truth coverage and normalized-date proof remain open quality
work; this four-stage engineering qualification does not certify every report.

Real DB differences discovered during timing were corrected in the test method:
legacy RAG cannot use Coair's wider user ledger schema, or open its DuckDB 2.0.0
physical file from DuckDB 1.5.5. Invalid reference probes are excluded. The new
`src.corpus_snapshot` command transfers only one project's chunks and search
metadata to a new database with integrity checks. Native-version export/import/
re-export reproduced the exact hash
`c0758a6f27abbf408ed4911533eae78a72c6dc4a61754b86eb8b6f0670524f4d`;
RAG opened all eight chunks and rebuilt FTS. No live data, account or balance DB
was replaced. Two portable-transfer regressions passed.

Runtime readiness now returns HTTP 503 until dependency validation completes
(three state tests). Verification and Word progress are emitted before the work,
and model metadata follows the selected runtime model (one real-DOCX regression).

The feature qualification release passed 203 API tests/13 subtests, three actual
PostgreSQL tests, frontend production build and public deploy smoke:
https://github.com/CoAirai/CoAIr/actions/runs/40094084448.
The final progress-order regression is additionally required in CI. Detailed
request/token/source metrics and exact PDF hashes are in `performance-check.json`.

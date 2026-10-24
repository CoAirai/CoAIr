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

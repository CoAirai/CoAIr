# Master Event Memory

New uploads become searchable as soon as their normal chunk/vector indexing is
complete. Event indexing is a separate, restart-safe job and is exposed as
`event_index_status`; a failed event job never rolls back document search.

Production uses PostgreSQL through `EVENT_DATABASE_URL`. On Cloud Run, attach a
Cloud SQL PostgreSQL instance and provide the URL as a secret. The application
applies the idempotent migration in
`migrations/master_event/001_master_event_memory.sql` before event workers
start. Local development and offline backfill use a DuckDB adapter.

Canonical source text is stored as immutable compressed JSONL in
`storage/canonical_events` and uploaded to the configured GCS bucket. Event
citations select `segment_id` and exact character spans in this artifact. The
event vector collection is rebuildable; PostgreSQL and the canonical artifact
are authoritative.

Rollout values are `off`, `audit`, and `primary_fallback` for
`CHRONOLOGY_EVENT_DISCOVERY_MODE`. Use `audit` first. It runs existing discovery
for the report while recording master-memory coverage. `primary_fallback` uses
master observations first and scopes legacy retrieval to incomplete documents
or missing facets.

Legacy chunks can be staged without writes:

```bash
PYTHONPATH=. python scripts/backfill_master_events.py --project-id PROJECT
```

Add `--apply` after inspecting counts. Add `--run-now` only for an offline/local
run. Existing legacy timeline rows are intentionally not promoted because they
do not carry re-verifiable source spans.

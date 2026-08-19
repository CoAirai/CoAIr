# Master Event Memory test plan

This plan separates tests that need no external service from tests that prove
the production adapters. A passing local suite proves the repository contract
and fallback logic; it does not by itself prove Cloud SQL, GCS or a hosted
vector provider.

## 1. Storage-boundary checks

Run:

```bash
PYTHONPATH=. .venv/bin/pytest -q tests/test_event_search_architecture.py
```

The tests assert these deliberate boundaries:

- document chunks and `document_index` share `storage/chunks/chunks.db`;
- master event truth uses Cloud SQL PostgreSQL in production and a separate
  `storage/master_events/master_events.db` only for local/offline work;
- canonical source text uses the `canonical-events/` GCS prefix;
- document embeddings use the configured document Qdrant collection or the
  document Pinecone namespace;
- event embeddings use `<document_collection>_events` or `__events__`;
- every event-vector delete contains both `project_id` and `doc_id`.

Failure of one of these assertions means the stores can no longer be described
as isolated.

## 2. Search without a vector database

The same suite creates real canonical artifacts and observations in a temporary
DuckDB master store, then makes event-vector search raise an outage. Expected:

1. `search_observations` finds the event using lexical text plus structured
   project, party, taxonomy and date filters.
2. Chronology emits an `evt_<observation_id>` evidence item.
3. No legacy fallback is called when requested coverage is complete.
4. Audit records `event_vector_search_unavailable` as a degradation.
5. A document-vector outage still permits legacy BM25 retrieval from chunks.

This is the answer to “what replaces vector search”: PostgreSQL FTS and indexed
structured columns are the primary exact/filterable lane. Dense vectors improve
semantic recall but are not canonical truth. If both the event vector and FTS
miss a synonym, focused legacy BM25/dense fallback remains necessary.

## 3. Discovery-mode and tenant checks

Run:

```bash
PYTHONPATH=. .venv/bin/pytest -q \
  tests/test_chronology_event_discovery.py \
  tests/test_event_search_architecture.py
```

Required behaviours:

- `off`: legacy discovery only;
- `audit`: legacy output, master result counts recorded;
- `primary_fallback`: master result first and no broad retrieval for complete
  coverage;
- partial documents: fallback restricted to those document IDs;
- missing counter-evidence: fallback restricted to master-hit and at most 20
  related document-index IDs;
- event-store outage: bounded document-index fallback and visible partial reason;
- another project's observations: zero results.

## 4. Ingest and provenance contract

Run:

```bash
PYTHONPATH=. .venv/bin/pytest -q tests/test_master_event_memory.py
```

This covers canonical hash stability, GCS URI parsing, exact source/date spans,
metadata-date rejection, relative dates, re-ingest retirement, project-scoped
purge, terminal failure status, `(project_id, doc_id)` backfill identity and the
single asynchronous document-classification call.

Add format fixtures in this order: native PDF, scanned PDF, mixed OCR PDF,
DOCX/TXT, EML/MSG plus attachments, XLSX and CSV. Each fixture must re-open the
canonical artifact and reproduce every accepted span and SHA-256 value.

## 5. Disposable PostgreSQL contract

Point the opt-in test at a disposable database, never a production database:

```bash
EVENT_TEST_DATABASE_URL='postgresql://...' \
PYTHONPATH=. .venv/bin/pytest -q tests/test_master_event_postgres_contract.py
```

It applies the real migration and verifies JSONB writes, queue/status fields,
PostgreSQL FTS, month-precision overlap, tenant isolation and cascade purge. The
test uses unique project IDs and removes them in `finally`.

## 6. Hosted vector smoke test

Use a dedicated test collection/index. Ingest one observation for project A and
one for project B, then verify:

1. project A search never returns project B;
2. the document collection count does not change;
3. deleting project A/document A removes only its event vector;
4. PostgreSQL search still returns the observation if the event collection is
   temporarily unavailable;
5. rebuilding vectors from PostgreSQL restores the same observation IDs.

Do this separately for Qdrant and Pinecone. Mock tests prove call construction,
not provider-side filter semantics.

## 7. Upload-to-Chronology acceptance

For one test project, record timestamps and counts at each transition:

```text
upload -> searchable -> event queued -> processing -> ready/partial
       -> master query -> focused fallback (if needed) -> report -> source preview
```

Acceptance requires that searchable status is not delayed by event extraction,
all failures are visible, source preview resolves the original span, 40 verified
events remain 40, and deletion removes canonical artifacts, relational rows and
event vectors.

## 8. Critical limitations to monitor

- DuckDB event search performs Python scoring after loading filtered rows; it is
  an offline adapter, not the multi-instance production search engine.
- `document_index` still shares the legacy chunk DuckDB/GCS checkpoint and is
  therefore not an independently scalable Cloud SQL service.
- FTS handles exact vocabulary well but dense search is still useful for
  paraphrases and multilingual wording.
- A live Cloud SQL/GCS/provider run is mandatory before `primary_fallback` is
  enabled beyond canary projects.
- Gold-set recall and counter-evidence recall remain product-quality gates; unit
  tests cannot establish the target percentages.


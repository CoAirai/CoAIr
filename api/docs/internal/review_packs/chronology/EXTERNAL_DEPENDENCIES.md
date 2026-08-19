# External dependencies and exclusions

This pack is intentionally non-runnable. Missing modules are boundaries, not
accidental omissions.

## Included only through a Chronology-facing excerpt

- `src.ai_reports`: V2 orchestration and dense/BM25 evidence retrieval. Forensic
  report generation is excluded.
- `src.llm_client`: structured generation, chronology budget context, relevant
  errors, and model-policy path. Provider SDK wrappers, credentials and general
  chat functions are excluded.
- `src.jargon_manager`: prepared-query contract and matching/expansion methods.
  The complete glossary and custom-term persistence are excluded.
- `src.file_router`: canonical artifact creation, event queueing and source
  purge. Unrelated file conversion routes are excluded.
- `backend.api.reports`: Chronology request, job, source, retry and download
  endpoints. Forensic and admin-only implementation details are excluded.
- `backend.tasks.report_jobs`: schema/store and Chronology worker branch. No
  database file or job row is included.
- `src.document_rag`: the query/hybrid/rerank surface used by V2. Vector backend
  setup and provider-specific transport are excluded.

## Not included

- Runtime DuckDB/SQLite databases, Qdrant/Pinecone collections, parquet tables,
  caches, GCS objects, and report artifacts.
- Uploaded PDF, DOCX, spreadsheet, email, OCR output, or authored chronology.
- Authentication, users, billing balances, provider keys, deployment secrets,
  and administrative screens.
- The Chatbot UI, Forensic Toolkit, and unrelated agent orchestration.

## Data contracts visible in code

Although no data is shipped, source code exposes the relevant logical shapes:

- `chunks`: project, document, filename, page, text and content-derived chunk ID;
- `document_index`: document metadata, parties/topics, date provenance, OCR
  quality and content hash;
- canonical event versions, source segments, extraction runs, observations,
  dates, jargon resolutions, exact clusters/relations and durable index jobs;
- `report_jobs` and `report_job_steps`: durable status, pipeline version,
  checkpoint input hashes and outputs;
- evidence objects: document/page or sheet/row identity, excerpt and rank score.

The included `src/report_errors.py` shows the complete stable checkpoint/job
error-code classifier. Raw provider diagnostics and runtime telemetry remain
outside the public Chronology response.

## Shared jargon resource

The full `config/jargon_terms.json` is excluded as a large shared data resource.
At this revision it contains **{{JARGON_TERM_COUNT}}** entries and has SHA-256
`{{JARGON_SHA256}}`.

Representative entries, included only to show ambiguity handling:

{{JARGON_EXAMPLES}}

The reviewer may assess the mechanism from the supplied code, but cannot audit
the completeness or correctness of all terminology without the excluded file.

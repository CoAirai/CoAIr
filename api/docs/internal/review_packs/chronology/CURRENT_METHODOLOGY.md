# Current methodology at `{{SOURCE_COMMIT}}`

The public product is a topic-scoped, evidence-backed report job. The active UI
does not display the older authored-chronology/event-browser workflow. It posts
a topic, optional dates, and parties, then polls a durable job and displays the
result with source links and a Word download.

## Shared entry and orchestration

1. The React page submits `POST /chronology/generate` and later polls the report
   URL returned by the API.
2. The API checks that the project has searchable documents, validates the
   chronology runtime, applies account policy, pins a pipeline version, and
   enqueues a durable report job.
3. Pipeline policy currently selects V3 for eligible demo accounts when the V3
   flag is enabled; other accounts remain on V2.
4. The report worker restores project/user context, attaches progress and
   checkpoint callbacks, invokes `generate_chronology`, writes the DOCX, and
   persists the result. A retry reuses the same job and validated checkpoints.
5. Both pipelines use the shared jargon layer and structured Gemini gateway.
6. New uploads independently build an immutable, span-addressed master event
   memory. In `primary_fallback` mode, both report pipelines use that store as
   their first discovery source.

Relevant sources: [ChronologyPage](source/frontend/src/pages/ChronologyPage.tsx),
[report API client](source/frontend/src/api/reportApi.ts),
[report endpoints](excerpts/backend/api/reports.py.md), and
[job worker](excerpts/backend/tasks/report_jobs.py.md).

## V2: passage-first research

1. `prepare_chronology_query` expands the topic with project-aware terminology
   and asks the model for 8–16 coverage-oriented research queries. It has a
   deterministic fallback.
2. With no analyst-selected document IDs, discovery first fuses PostgreSQL
   lexical/structured observation search with the separate event-vector index.
   It loads exact source spans and a separate counter-position lane.
3. Legacy dense/hybrid plus BM25 retrieval runs only for incomplete event-index
   documents, missing requested event families or new gap leads. It is scoped
   by document IDs and creates a re-index audit/job when it discovers a record
   absent from otherwise indexed event memory.
4. Unlike the older description, automatic V2 generation no longer converts
   the ranked passages into a fixed list of 12 documents and rereads them. It
   keeps the passages retrieval actually scored, then applies a character and
   coverage-aware evidence-pack budget.
5. If the analyst explicitly supplies document IDs, those documents are read
   and the evidence budget is shared across them. The request schema no longer
   imposes the former twenty-document product ceiling.
6. Evidence is split into bounded batches. Structured-output failures split a
   batch recursively; unrecoverable fragments are recorded so partial coverage
   is visible rather than silently presented as complete.
7. The model extracts up to 18 candidates per evidence batch. That is a
   single-call bound, not a report limit. Candidates are clustered only on the
   full normalised date-plus-claim key; every original observation retains its
   own source links.
8. Overview synthesis runs once. Event synthesis runs in batches of at most 12
   clusters and must return every input `cluster_id` exactly once. There is no
   final 18-event ceiling or truncation.
9. A separate LLM audit verifies at most 30 claims per call and must cover every
   claim reference exactly once. Deterministic guards additionally reject
   unknown source IDs, unsupported dates, numbers and quotations. Any exhausted
   batch failure fails the job instead of silently omitting events.
10. The Word renderer supplies real footnotes and stable
   `6.<issue>.<event>` numbering.

Primary sources: [V2 engine](source/src/chronology_v2.py),
[shared V2 orchestration/retrieval](excerpts/src/ai_reports.py.md), and
[evidence budget](source/src/evidence_pack.py).

## V3: document-first research

1. The planner produces entities, expected document families, and expanded
   lexical research queries. In `primary_fallback`, master-event discovery then
   replaces broad document selection as the primary path.
2. The document index ranks up to 100 initial candidates only in `off`/`audit`
   mode or as focused fallback. `_select` normally
   chooses 12 readable documents by role: map, primary, corroborator, then the
   remaining ranked records.
3. Selected map/overview records are read as discovery guides. The model emits
   a skeleton and exact research leads; a second document-index search follows
   those leads.
4. Two deterministic coverage-gap rounds may extend the selected set up to 20
   documents. Full selected text is used to assess coverage, but extraction
   receives only the coverage/character-budgeted evidence pack.
5. Document text is divided into stable-looking evidence excerpts. Spreadsheet
   and table evidence carries sheet/row anchors; document evidence carries page
   anchors.
6. The model extracts event candidates batch by batch. Candidates are clustered
   only on full normalised date, actor and action. Every source-bound original
   remains an observation; missing-record sets may be unioned without moving
   claim provenance between observations.
7. Overview synthesis runs once. Event synthesis runs in batches of at most 12
   clusters and must return every input `cluster_id` exactly once. There is no
   final 18-event ceiling or truncation.
8. Verification runs in batches of at most 30 claims. A separate model returns
   PASS/QUALIFY/SPLIT/REMOVE/NEEDS_HUMAN_REVIEW decisions; repairs run in small
   batches, and every claim reference must be covered exactly once. Supporting
   and counter-evidence IDs are both preserved through verification and repair.
9. Only evidence cited by issued supporting or counter-evidence claims is
   returned. The UI labels counter-evidence separately, exposes partial coverage
   warnings, and the Word document creates separately labelled real footnotes.

Primary sources: [V3 engine](source/src/chronology_v3.py),
[document index](source/src/document_index.py), and
[V3 prompt contract](source/config/prompts/chronology_v3.yaml).

## Ingest-time master event memory

1. OCR/native page text, structured email parts and deterministic table rows
   are written once to immutable compressed canonical artifacts.
2. Stable version and segment IDs include project/document identity, content,
   source locator and text hashes. Re-ingest retires the former active version.
3. A restart-safe asynchronous job scans every segment deterministically for
   date, relative-date and construction/jargon signals. Every segment receives
   a scanned plus candidate/skipped audit disposition.
4. Gemini Flash-Lite extracts structured observations from candidate windows
   and returns document metadata in the first same-text call. It selects claim,
   date and actor character spans; it does not author source quotations.
5. Deterministic validation rechecks bounds, substrings, hashes, dates, actors
   and numbers. High-risk causation/responsibility/entitlement interpretations
   receive a stronger semantic verification pass.
6. Exact cluster keys preserve every source-bound observation. Similar records
   may receive a `related_candidate` link but are never fuzzily auto-merged.
7. PostgreSQL is canonical in Cloud Run, GCS holds canonical text, and the
   event vector collection/namespace is a rebuildable derivative.

## Citation and provenance today

- The model does not invent arbitrary source IDs: schemas require it to select
  IDs supplied with the evidence, and deterministic validation rejects unknown
  IDs.
- Master observations resolve to immutable `segment_id` plus exact claim/date
  character spans and SHA-256 values. Issue-report evidence IDs are derived
  from those observations. Focused legacy fallback evidence remains at the
  older excerpt/page or sheet/row granularity.
- Numbers and quoted strings in issued prose must occur in cited excerpts.
- Footnotes resolve to document/page or sheet/row metadata. They are stronger
  than free-form citations but weaker than immutable segment plus character
  span plus content-hash citations.

## Legacy ingest-time event timeline

The older deterministic DuckDB event timeline still exists for its legacy
screen/API, but new upload event extraction no longer writes through the former
first-4,000-character enrichment path. It is not promoted into master memory:

- its existing rows were created from sampled enrichment and are spanless;
- the event record has document identity but no immutable segment, character
  span, quote hash, corroboration relation, or extraction-version lineage;
- its stable event ID hashes document, type, date, and generated description;
- legacy backfill starts from `(project_id, doc_id)` chunks and re-extracts
  canonical observations; it does not treat timeline narratives as verified.

See [ingest excerpts](excerpts/src/file_router.py.md) and
[event timeline](source/src/event_timeline.py).

## Differences from the older ten-step summary

- “Keeps up to 120 excerpts” describes an upstream candidate boundary, not the
  final amount read; current evidence-pack selection is character and coverage
  budgeted and reports dropped evidence.
- Fixed automatic selection of 12, extendable to 20, describes V3. Current V2
  automatic generation is passage-first and does not use that document cap.
- In `off`/`audit`, V3 still ranks/selects documents before extraction. In
  `primary_fallback`, master observation search is primary and document
  retrieval is a scoped completeness fallback.
- Master evidence is immutable and character-span anchored; legacy fallback
  evidence still has excerpt-level granularity.
- Both versions now use deterministic exact clustering and preserve original
  observations. Neither asks an aggregation model to reduce material events to
  a report quota.
- The former final 18-event ceiling has been removed in both versions. V2 still
  has an extraction-call maximum of 18 candidates, while synthesis and
  verification are independently batched without trimming the issued record.

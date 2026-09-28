# Metadata and chronology

The existing chronology discovery, master-event memory, fallback retrieval,
source verification and Word export remain in place.

- Local metadata (title, summary, type, date, people, organisations and topics)
  feeds the project document index. Its search text helps identify records to
  read; the original OCR passages remain the source of report claims.
- Manual OCR/metadata corrections queue document reindexing. The asynchronous
  event worker now preserves reviewed titles, summaries, document types and
  people/organisations, including intentionally cleared fields. Event topics
  can still enrich document discovery.
- The V2 research/evidence cache revision includes the document index as well
  as OCR text. A metadata-only change invalidates an older research selection.
  Changes in another project or an unselected document do not invalidate a
  revision explicitly scoped to selected document IDs.
- A document's metadata date is a discovery hint, not proof of an event date.
  Event dates still require supporting source text and independent verification.
- Completed reports remain immutable snapshots; new metadata is used on a new
  generation or an eligible retry. Existing completed reports are not silently
  rewritten.

Validation: four metadata-specific regression tests, plus the existing sixteen
local chronology/pilot/graph tests (20 total). These checks cover metadata-only
cache changes, project/document isolation, human corrections and event enrichment.

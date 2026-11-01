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

## Event dates are separate from system dates

Only `event_date` drives chronology headings and ordering. Generic `date`,
`created_at`, upload, ingestion, indexing, processing and file modification dates
are never fallbacks. Undated events remain visible as **Date not established**.
V2, V3 and the master-event validator check the date's content provenance,
verbatim supporting quote, calendar validity and normalized value. System timestamp
labels are rejected even if misclassified as content. Month/year evidence cannot
justify an invented day. Document/header dates may date issuance/receipt/signature
only when that is the actual sourced event; the independent verifier checks this
semantic relationship.

Existing MUDFA output was backed up and revalidated: all 144 entries remain;
15 dates were reduced to supported precision and 24 automatically unverified dates
were cleared for source review. 71 entries retain a normalized event date. Some
short-year or OCR-damaged dates require manual review; clearing a date does not
mean the event is false. Existing claims were retained, not independently re-audited
in this date-only pass. Both fictional pilot reports needed no date changes.

Dates are revalidated against surviving claims after independent verification,
then entries are sorted and numbered again with undated events last.

Validation: 28 targeted backend tests, including eight event-date separation
cases, and five frontend tests. The DGX local-model acceptance run used a fictional
record dated 20 September 2010, uploaded in September 2026. Approval and completion
events correctly retained 12 and 14 April 2007; no upload date became an event date.
The model also included the explicitly sourced record-preparation event on
20 September 2010, which was checked separately. The Word export was validated.

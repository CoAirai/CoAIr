# Controlled RAG prompt, report and table transfer

Reference: the RAG implementation running on AWS and used in customer
presentations. Target: Coair integration branch; preserve Coair management,
roles, billing and UI design. This release does not replace main or production.

## Preserve proven behavior first

The review inventories named prompt expressions across ten agent/report modules
and both chronology prompt files. **32 contracts match the RAG reference**, with
no missing inventoried prompt. They are pinned in
`api/tests/fixtures/rag_accepted_contract.json` and tested in the API gate.
The canonical expression fingerprint works across Python 3.11 and 3.14.
Text/AST parity protects reviewed instructions; it is not proof of every model
response being equally correct.

Four reviewed differences remain: three document-synthesis prompts inject only
selected, project-scoped source context; the inactive V3 prompt retains Coair's
counter-evidence/provenance improvements. Qualified staging still uses V2.
`prompt-review.json` gives the individual hashes. This inventory covers named
prompt expressions, not every dynamically assembled instruction in the program.

Changes made after review:

- Restored the RAG document-system instructions, removing Coair's extra markdown
  prohibition, forced ranking-table format and embedded fictitious monetary
  example. These extras constrained output and introduced irrelevant example
  facts. Structured database results now have their own reliable renderer.
- Removed Coair-only repeated claim-cap wording from the V2 synthesis prompt.
  The active V2 prompt file and synthesis base now match RAG. Source grounding,
  independent verification and the accepted RAG schemas remain in place.
- Restored the RAG OFFTOPIC prompt category and its router behavior together.
  Merely copying the prompt would have left an unsupported enum/dispatch path.
  Obvious unrelated questions avoid retrieval/planning; real project questions
  about weather effects, contract sums and spreadsheet calculations stay valid.
- Retained the previous single-pass glossary fix. Repeating terminology expansion
  over selected document text had already caused an OOM; it is not reintroduced.
- Retained repeated grounding checks across extraction, synthesis and independent
  verification. These are separate checks, not accidental duplicate work.

## Report limits and quality acceptance

There is no new total-event limit on Coair's report. The 12-event value is a
synthesis batch size and every batch is processed; the 20-document value is a
preview presentation limit. Accepted RAG schemas permit five overview claims and
four atomic claims per event. The 240,000-character evidence pack, per-document
allocation, provider budgets and batching are also present in RAG. Removing these
shared controls indiscriminately would change the reference behavior, increase
truncation risk and would not prove better quality. This transfer removes the
Coair-specific prompt restriction and protects the RAG behavior instead.

Two successful production RAG jobs were captured read-only into private
qualification storage. Their provider checkpoints and selected evidence are
regression fixtures, never an application data source or a ready-made demo answer.
Running the current Coair downstream pipeline with those exact checkpoints gives:

| Accepted reference | Evidence | Entries preserved | Word paragraphs | Footnotes |
|---|---|---:|---:|---:|
| MUDFA | 129 passages / 36 documents | 26 / 26 | 29 | 53 |
| Gogar depot | 114 passages / 25 documents | 14 / 14 | 17 | 27 |

Claim wording, order, dates, source IDs, Word narrative and footnote text match.
No source references are unresolved. The replay makes **zero provider calls**;
it proves preservation after model generation, not fresh-model equivalence.
Metadata evidence is in `rag-output-regression.json`.

Fresh model generation was then run separately against the same fixed 129-passage
MUDFA evidence pack, with the RAG report-source modules and the Coair source,
Gemini 3.6 Flash, one CPU/1,536 MiB, identical provider client/settings and provider
response caching disabled. Native account/payment and database engines were not
swapped. Retrieval, planning and evidence selection were held fixed deliberately:
this is a post-retrieval comparison, not a full native-runtime benchmark.

| Fresh pipeline | Entries including overview | Footnotes | Time |
|---|---:|---:|---:|
| RAG report source | 26 | 43 | 80.40 s |
| Coair | 28 | 44 | 86.11 s |

Both used valid supplied source IDs, had zero unresolved footnotes and retained
every synthesized candidate after verification. Both report `uncovered_facets`.
One run per pipeline does not prove statistical speed or complete semantic parity.
A strict date-plus-overlapping-source comparison with the older accepted RAG
report matched 19/25 events in fresh RAG and 18/25 in fresh Coair. Counts alone do
not prove all original facts were retained. This also illustrates variation
within the reference itself. See `report-quality-check.json`.

Full-corpus retrieval, expected-fact/manual review and normalized-date proof
remain promotion gates. The previously demonstrated normalized-date verifier gap
is shared by RAG and Coair and is not concealed by these tests. Its correction
must be checked against these accepted outputs as a separate factual-correctness
change. No claim of complete legal/factual correctness is made here.

## Structured tables and charts

The existing backend SQL artifact now reaches live chat and persisted history.
The UI displays ordered columns, exact database values, empty-result headings,
row counts, CSV export, optional provider-independent chart metadata, source
opening and generated SQL. SQL source metadata resolves the original project-owned
Excel/CSV rather than an internal Parquet view. Chart code loads only when a
chart is actually shown.
The current backend preview remains bounded exactly as in RAG, and the UI labels
how many rows are shown rather than implying that a preview is the full result.

The full structured artifact is stored with each new assistant message so reload
preserves chart, column order, original total count and source provenance. Older
messages still reconstruct through the existing response builder. A duplicate
with equivalent typed values (including harmless decimal/boolean formatting) is
suppressed; different analytical tables stay visible.

Source tables share one renderer across the side panel, enlarged reader and
report source viewer. The extra frontend-only 40-row slice is removed; all rows
supplied by the backend preview are rendered. PDF behavior remains unchanged.

Numeric regression checks cover zero, false, negative and precise values, nulls,
missing legacy headings, empty results and invalid chart fields. Real disk-backed
conversation reload checks preserve the full artifact and retain project isolation.
Live spreadsheet/browser qualification is recorded in `table-ui-check.json`
after the immutable integration release. No real email, Stripe or customer
account-management flow is modified by this work.


## Qualified integration release

Commit `d5b321773a71147e2e277bd468df66ffaaa1e4e1` is deployed to
`https://coair-test.duckdns.org`. The protected deployment passed 352 API tests
and 13 subtests, three PostgreSQL tests, 159 frontend tests across 39 files,
TypeScript validation, the production frontend build and the public smoke.
The original RAG and other reference containers remained unchanged. Main stays
at `ca5302b9b1b8c75cb78bfe8fe2c57b8c119ed417`.

A real uploaded Excel workbook was indexed in an isolated QA project, queried
through the live API and through the browser chat composer. Exact zero, false,
negative and decimal values survived table display and CSV export. The chart
rendered; history reload retained it. Empty results retained their headings.
The source control opened the original Excel in both the side panel and expanded
reader. Only one equivalent result table appeared. The browser recorded no page
errors. See `table-ui-check.json` and `table-live.png`.

The QA file was deleted and its project archived after validation; the original
three-document staging project was checked unchanged. Disposable dependency,
benchmark-store and build directories are removed after saving qualification
artifacts. Private evidence and actual Word reports remain in protected server
qualification storage, outside the application and repository.

This is an accepted prompt/output-preservation and structured-result release.
Full-corpus coverage, normalized-date proof and the earlier hosted account,
email/payment and database-cutover gates remain separate work before main or
production promotion. No main/production parity sign-off is implied.


## Full-corpus chronology comparison — 25 October 2026

**Decision: the core transfer is supported, but a general customer cutover is
not approved.** Reviewed pilot use is reasonable after loading and assigning the
intended corpus in the chosen environment. Completion reliability, temporal
support and topical coverage need further work. No application or prompt was
changed during these runs.

The earlier small staging corpus and fixed-evidence comparison are supplemented
here by native planning → retrieval → evidence selection → generation → Word
runs against the same full project search corpus: **135,451 chunks, 7,289 distinct
file names, 240,105,771 text characters**, plus the same read-only Qdrant project
with 156,200 vectors. File-name counts describe the search corpus, not a reconciled
original-PDF/library inventory. Both native DuckDB versions receive the same
integrity-checked corpus (`6d2366738e62b43a7c2265df8576a1b1b55aedfc06cd1a67351c1216ca7ea3bb`).
Both use Gemini 3.6 Flash and the same chronology prompt hash. Model response
caching is disabled; answers and selected evidence are not frozen or replaced.

Production RAG runtime source is captured read-only; target source is deployed
Coair commit `d5b3217`. Accounts and event stores are disposable native stores.
Master-event memory starts empty in both, with native audit discovery falling
back to normal retrieval. Production originals are mounted read-only and Qdrant
mutation methods are blocked. This tests the native engines, not seven public
browser journeys or a production database migration.

| Question | RAG event rows / Word footnotes | Coair event rows / Word footnotes | Observation |
|---|---:|---:|---|
| MUDFA scope, mobilisation, difficulties and programme consequences | 31 / 52 | 30 / 57 | Similar central coverage; key source excerpts inspected. |
| Gogar depot, July–December 2008 | 4 / 14 | First run failed; explicit repeat 9 / 21 | First failure retained. Different selected events; no complete-coverage claim. |
| Utilities diversion and Parsons Brinckerhoff responsibilities | 6 / 19 | 5 / 20 | Both retain the central PB/SDS responsibilities; each adds different context. |

Counts exclude the overview and count rows, not proven unique events. All six
completed Word files have resolving footnotes, valid supplied source IDs and
narrative layout. Each is partial under the pipeline's coverage reporting.

### Content review and failure evidence

- MUDFA: both cover the October 2006 contract, July 2007 commencement, roughly
  285 delayed IFC drawings, six-week progress delay, six-month notified delay,
  and Revision 8's 16 December 2009 target. These central claims were checked
  against their cited excerpts. Neither fully explains the requested contractor
  versus design responsibility distinction. Coair adds an unrelated JRC modelling
  award; both repeat some contract/business-case material.
- Gogar: the first Coair run failed after internal retries because its overview
  exceeded the shared schema's three-source-per-claim/five-overview-claim limits.
  One declared fresh repeat completed without a code/prompt correction. It is
  not relabelled as a successful first attempt. RAG and the successful repeat
  distinguish programmed milestones from completed work. Their coverage differs:
  RAG includes the 13 October earthworks finish; Coair adds expected HV quotations.
  Both include the 6 November bridge-drawing milestone. Neither includes the
  older reference's DCR0010 event. Coair repeats a culvert milestone and adds broad
  project/OLE/staff context; RAG includes a Baird Drive transmittal.
- Utilities: both explain the PB/SDS assistance and utility-design responsibilities.
  Coair entry `6.1.5` places retrospective ground-investigation and approximately
  59,000m actually undertaken assertions under 4 December 2007. The witness
  statement dates the cited design-programme documents to that day; it does not
  independently date every subsequent assertion to it. The quantities are not
  thereby disproved, but their temporal attribution is unproven. Similarly, a
  dated claim cover does not by itself prove actual submission on that date.

The active report builder differs only in a comment; the reviewed V2 pipeline
source differs in comments/import ordering. Evidence selection and discovery
source match. Retrieval, lexical runtime and source-scope changes remain, and the
planner/model produces different intermediate questions. In MUDFA, 108 passages
and 31 file names are shared between the two selected packs (124/121 passages,
33/34 files). Thus different output is not explained by missing input documents
alone. This is not an ablation proving each difference's individual cause.

### Resource and qualification limits

The first RAG Gogar probe hit the disposable 3 GiB memory limit before producing
a report; a Docker OOM event confirms it. It is excluded from the content
comparison and recorded separately. Later runs explicitly cap DuckDB at 1 GiB
and one thread. The first target run rebuilt FTS while RAG reused an index; there
is one run per case/engine plus the declared Coair repeat. The observed seconds
in `chronology-comparison.json` therefore are not a controlled speed benchmark.

The running test API still has **2 GiB and three sample PDFs**; these engine
runs have up to 3 GiB. Full-corpus capacity on that deployed API, original-file
mapping and a complete library migration remain gates. All customer/role/payment
stores, the RAG container and the integration application release are unchanged.

Next acceptance priorities are source-preserving schema repair, per-claim temporal
support, stronger topical filtering/deduplication, and full-data deployment
capacity. Repeat these exact questions after correction, preserving the first
failure and current Word outputs. The detailed metrics and manual findings are
in `chronology-comparison.json`; private inputs and raw outputs stay in protected
server qualification storage. Six Word copies are delivered locally in
`/Volumes/Adata/Codex/CoAIr-chronology-review`.

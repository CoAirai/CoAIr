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
Excel/CSV rather than an internal Parquet view. Chart code loads only when a chart is actually shown.
The current backend preview remains bounded exactly as in RAG, and the UI labels
how many rows are shown rather than implying that a preview is the full result.

The full structured artifact is stored with each new assistant message so reload
preserves chart, column order, original total count and source provenance. Older
messages still reconstruct through the existing response builder. A duplicate with equivalent typed values (including harmless decimal/boolean
formatting) is suppressed; different analytical tables stay visible.

Source tables share one renderer across the side panel, enlarged reader and
report source viewer. The extra frontend-only 40-row slice is removed; all rows
supplied by the backend preview are rendered. PDF behavior remains unchanged.

Numeric regression checks cover zero, false, negative and precise values, nulls,
missing legacy headings, empty results and invalid chart fields. Real disk-backed
conversation reload checks preserve the full artifact and retain project isolation.
Live spreadsheet/browser qualification is recorded in `table-ui-check.json`
after the immutable integration release. No real email, Stripe or customer
account-management flow is modified by this work.

# Prompt for Claude or Codex

Attach the complete Chronology review pack, then use the following prompt.

---

You are reviewing a construction-dispute chronology system. Treat this pack as
the only source of truth. It is a read-only code snapshot, not a runnable app.

First reconstruct the current implementation before recommending changes:

1. Trace the active request from the React page through the API, durable worker,
   pipeline selection, evidence research, extraction, aggregation, synthesis,
   verification, DOCX generation, persistence and source viewing.
2. Describe V2 and V3 separately. Identify every ranking boundary, document or
   passage count, character/token budget, coverage check, style limit and retry
   checkpoint. Do not repeat an older methodology summary when the supplied code
   differs.
   Explicitly distinguish extraction-call limits from final report limits and
   verify whether any global 18-event truncation remains.
3. Trace the immutable canonical source, asynchronous master-event indexing,
   jargon governance, span validation, exact clustering and event search.
   Separately explain why the legacy ingest-time event timeline is not migrated.

Then audit these hypotheses from `REVIEW_HYPOTHESES.md`:

- sampling versus corpus census and the resulting false-negative exposure;
- excerpt IDs versus immutable segment IDs plus character spans;
- model-selected citations plus downstream policing;
- loss of corroborating or conflicting sources during deduplication/aggregation;
- exact cluster coverage, synthesis/verification batching and failure semantics;
- splitting the product into a master chronology and issue chronologies;
- the need for measurable gold-set recall and citation-integrity metrics.

For every hypothesis classify it as:

- **supported by current code**;
- **partly supported / needs qualification**;
- **outdated for V2, V3, or both**; or
- **not decidable from this pack**.

Design a concrete improvement path if warranted:

1. Propose stable segment and citation-span semantics for PDF text, OCR text,
   emails, Excel/table rows and later reingest. Specify IDs, hashes, offsets,
   source versions and re-verification rules.
2. Propose deterministic event observations and clustering that retain every
   corroborating, conflicting and superseding source while keeping a separate
   canonical event narrative.
3. Audit the supplied master-event schema and compare it with extending the
   legacy timeline. Cover migration, deletion/purge, OCR corrections,
   model/prompt upgrades, project jargon approval and human overrides.
4. State which existing V2/V3 stages should be retained, replaced or demoted to
   ranking/synthesis over master events.
5. Define a gold-set evaluation plan covering event recall, material-event
   recall, source recall, citation/span integrity, date accuracy, attribution,
   causation false positives, cluster purity and reproducibility.
6. Rank recommendations by impact, implementation cost, migration risk and
   reversibility. Separate immediate safeguards from architectural work.

Evidence discipline:

- Cite bundle file paths and line numbers for every material finding.
- Files under `source/` are complete originals. Files under `excerpts/` are
  verbatim source selections with original line spans.
- Do not infer the behaviour of modules listed as excluded. Record the missing
  fact and say how it should be verified.
- Do not assume a database row, customer corpus or gold set exists merely
  because a schema or interface exists.
- Keep established implementation facts, reasonable inferences and proposals
  clearly separated.

Deliver:

1. an implementation-accurate current-state summary;
2. a claim-by-claim verdict table;
3. the most serious failure modes with evidence;
4. a target architecture and staged migration plan;
5. schemas/interfaces at the level needed to evaluate the proposal;
6. tests and measurable acceptance criteria;
7. open questions that cannot be answered from the pack.

---

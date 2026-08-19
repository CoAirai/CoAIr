# Review hypotheses to test against the code

These are external review claims, not accepted conclusions. Evaluate each one
separately for V2, V3, the new master event memory, and the legacy timeline.

## H1 — A chronology must census, while the report pipeline samples

The issue chronology can only extract events from evidence that survives
retrieval and evidence-pack selection. Downstream verification controls false
positives but cannot recover a false negative that never entered the pack.

Questions:

- Which current limits are hard counts, character budgets, ranking boundaries,
  or merely style targets?
- Does the current coverage audit measure evidence facets or actual event recall?
- Would a full corpus census be proportionate for every project and document
  type, or should it be an independently built/indexed product?

## H2 — Verify the new immutable-span contract and its fallback boundary

Master extraction now selects supplied segment IDs plus exact claim/date/actor
character spans; deterministic checks verify substrings and hashes. Legacy
retrieval fallback still produces page/row excerpts rather than canonical spans.

Questions:

- How stable are current IDs under OCR correction, rechunking, reingest, page
  boundary changes, or table normalisation?
- What should `segment_id`, start/end offsets, source-content hash, extraction
  version, page/sheet/row anchors, and quote hash mean for each document type?
- Which checks become arithmetic and which still require interpretive review?

## H3 — Citation selection and citation interpretation are different risks

Master extraction selects source spans, while issue synthesis selects observation
evidence IDs and a separate model/deterministic rules police final prose. This
remains stronger for source integrity than for interpretive proposition support.

Questions:

- Can claim construction be constrained to selected spans rather than prose plus
  excerpt IDs?
- Which propositions—causation, entitlement, critical path, attributed party
  position—still need semantic verification after span integrity is guaranteed?

## H4 — Consolidation may lose corroboration

Current V2 and V3 code no longer asks an LLM to reduce candidates to a fixed
event count. Exact deterministic clusters preserve each original extraction as
a source-bound observation, while supporting and counter-evidence remain
separate. Review whether this implementation fully closes corroboration loss or
only the previously identified exact-duplicate path.

Questions:

- Do exact-key clusters retain every duplicate observation and its own sources?
- Can a deterministic event cluster preserve every observation/source while a
  separate canonical event row supplies the narrative?
- How should conflicting, corroborating, superseding, and duplicate relations be
  represented without asking a generation call to decide silently?
- Can similar but non-identical extractions remain fragmented, and is that safer
  than a semantic merge without span-level ground truth?

## H5 — Master chronology plus issue chronology

Implemented direction to audit:

- a versioned master chronology built across the corpus, with every extracted
  assertion anchored to immutable source spans;
- issue chronologies query master events first and use scoped legacy retrieval
  for incomplete indexes, missing facets, counter-evidence and gap repair.

Questions:

- Can the current event timeline be migrated, or is a new event/observation/
  citation/cluster schema required?
- How are deletions, reingest, OCR corrections, model upgrades, event disputes,
  and human overrides versioned?
- Does “every dated assertion” create unacceptable noise, and what deterministic
  inclusion taxonomy is defensible?
- Which current V2/V3 stages remain useful as issue framing, prioritisation,
  synthesis and verification over a master store?

## H6 — Improvement must be measurable

A design cannot claim stronger completeness without a reference set.

Require proposed metrics for at least:

- event recall and material-event recall;
- source/observation recall per event;
- citation ID integrity, span integrity, and quote-hash integrity;
- date accuracy and date-source accuracy;
- party-position attribution and causation false-positive rate;
- cluster purity, corroboration preservation, and contradiction preservation;
- reproducibility across reingest and model/prompt versions.

# Chronology technical review pack

Source revision: `{{SOURCE_COMMIT}}`

This is a read-only research pack for reviewing how COAir currently builds
construction chronologies. It is deliberately not a runnable application. It
contains the chronology implementation, the narrow shared-code surfaces it
uses, tests, prompts, and a source manifest. It contains no project database,
uploaded document, authored chronology, credential, or user record.

## Suggested reading order

1. [CURRENT_METHODOLOGY.md](CURRENT_METHODOLOGY.md) — reconstruct the current
   V2 and V3 flows before judging the design.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — follow the UI-to-DOCX call graph and
   see which layers are shared with the wider application.
3. [REVIEW_HYPOTHESES.md](REVIEW_HYPOTHESES.md) — test the proposed critique
   against the implementation rather than accepting it as fact.
4. [EXTERNAL_DEPENDENCIES.md](EXTERNAL_DEPENDENCIES.md) — understand what is
   intentionally absent and what can and cannot be inferred without it.
5. [ASK_CLAUDE.md](ASK_CLAUDE.md) — copy this prompt into Claude or Codex after
   attaching the complete extracted folder or ZIP.
6. [MANIFEST.json](MANIFEST.json) — verify provenance, source hashes, original
   line spans, and dependency links for every included source.

## Evidence rules for the reviewer

- Treat the files under `source/` as complete, byte-for-byte source files.
- Treat files under `excerpts/` as verbatim, non-runnable selections. Every
  selection names its original path, line span, source hash, and snippet hash.
- Cite bundle paths and line numbers for conclusions.
- Do not assume excluded infrastructure behaves in a particular way. Mark any
  conclusion that depends on it as an open question.
- Separate V2, V3, the new master event memory, and the legacy event timeline.
  They are related but materially different mechanisms.

## Deliberate boundary

This pack answers “what does the chronology code do and how might it improve?”
It does not provide a corpus on which completeness can be measured. Claims
about recall therefore remain design assessments until tested against a
hand-built gold set.

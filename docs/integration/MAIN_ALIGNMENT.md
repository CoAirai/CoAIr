# Main alignment of long-document evidence

`codex/long-document-evidence` contains the complete current main history plus
its original long-document/report and streaming development history. Main was
merged without rebasing, squashing or discarding those commits.

The combined application preserves main's spreadsheet date-order fixes,
authentication/test isolation and VPS deployment fixes, while retaining:

- report source expansion, coverage accounting and source-checked evidence reuse;
- independently grounded chronology dates, occurrence coverage and claim repair;
- bounded parallel evidence reviewers and section writers for long answers;
- final-answer streaming, English activity stages and full tool findings;
- document citations, source locators, tables and Word/Excel rendering;
- dependency locks, output-budget checks and DuckDB resource-budget handling.

The main merge resolves only CI/review-document overlaps. The original feature
implementations remain intact. CI now validates PRs targeting main and uses the
actual authorization test filenames. The agent test mocks its final answer writer
so it cannot accidentally call a real model. The PostgreSQL provider-key migration
also works without Supabase roles while retaining RLS and Supabase permissions.

The separate `codex/dgx-secure-local` branch includes additional appliance/local-LLM,
code-protection and installation work. Those appliance-specific changes are not
part of this main-alignment PR. No runtime provider default is changed here.

## Review and deployment

The main-targeting PR is for review, not automatic production promotion. Existing
integration deployment remains gated by its approved branch/qualification commit.
Do not change that qualification variable as part of merely synchronizing main.
The original RAG checkout and the running AWS/DGX deployments are unaffected.

# Project isolation acceptance

## Required behavior

Every authenticated query is restricted to its server-authorized active project.
Membership in another project, a platform/operator role, an Edinburgh corpus tag,
a supplied document ID, a filename collision or an empty local result does not
expand that query's data scope. An empty project remains empty. Legacy data must
be explicitly assigned to the correct project before it can answer its queries.
Shared physical database/vector storage is retained; filters and ownership checks
must apply before data reaches retrieval results, prompts or document previews.

## Correction

- Removed the document viewer's unscoped chunk fallback. Local registry, catalog
  and chunk membership can still resolve relocated shared source files.
- Removed the library's global corpus fallback for empty projects and restricted
  router filename resolution, file inventories and chunk searches by project.
- Made active-project ownership authoritative over the legacy corpus table tag
  in the SQL router and agent table context.
- Intersected SQL selection and execution allowlists with project-owned tables,
  including explicit table names, empty selections, provider queries, generated
  SQL, retries and schema aggregation. Empty lists never choose a global fallback.
- Scoped notice search in SQL before ranking/LIMIT, using document IDs rather
  than filenames, so identical filenames cannot mix projects' metadata.
- Removed the global corpus filename cache from request routing. Agent survey
  enrichment rejects foreign registry records and omits global cluster labels.
- Applied the same project document-ID boundary to correspondence threads,
  unanswered-message selection for drafts, and same-name RAG body previews.
- Retained canonical file IDs in dense fallback/provider source responses.
  Optional metadata retries preserve the project and document filters.

These changes do not alter authentication roles, payment rules, storage engines
or the production RAG deployment. No database is replaced and no legacy data is
silently reassigned. Removing a legacy bypass can make unassigned old data
unavailable; its project assignment must be migrated explicitly.

## Verification

The focused isolated run passed 199 tests and four subtests, including real
DuckDB, a real local Qdrant adapter, project/header authorization, conversation
scope and existing authorized source-preview contracts. Tests include same-name
PDFs/notices, foreign document IDs, forged SQL allowlists, empty projects and
missing vector project scope. The full selected API deployment gate also passed **309 tests and 13 subtests**
against the updated source in the isolated API runtime. The deployment CI now requires the expanded
preview, SQL and router regression cases in addition to its existing checks.

Live qualification uses two disposable projects with identically named PDFs and
different private markers, checks each project's actual chat/citations and
cross-project preview rejection, and confirms the original sample PDFs still
open. Its result is recorded separately as
`/opt/coair-integration/qualification/project-isolation-live.json` after deployment;
unit-test success alone is not a claim that the running environment is updated.

The independent company archive/restore PATCH issue from the release review is
outside this correction and remains open. Full-corpus report quality and hosted
provider qualification also remain separate acceptance items.

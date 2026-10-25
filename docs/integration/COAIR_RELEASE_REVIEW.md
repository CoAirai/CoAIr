# Coair release review and developer handoff

> Historical 24 October snapshot. The organization PATCH, report-date checks and subsequent release qualification are superseded by [FOUR_AREA_REVIEW.md](FOUR_AREA_REVIEW.md). File counts and byte-equality claims below refer only to that historical snapshot.

Reviewed on 24 October 2026. Application: `integration/rag-agent-parity` at
`c6124f5958305b72b7f1374fab72f82a11430f01`; Coair main baseline:
`ca5302b9b1b8c75cb78bfe8fe2c57b8c119ed417`.
This is an acceptance review, not approval to replace production or its database.

**Follow-up:** the project-isolation correction is now committed on
`integration/rag-agent-parity` at `651d9c1c7938083d92370fff2a6ad9484d0266d3`.
It is deployed and the live two-project isolation acceptance passed on the test hostname.
See `PROJECT_ISOLATION.md` and `project-isolation-check.json` for the correction
and current acceptance evidence. The source hashes and B1 reproduction below
refer to the earlier `c6124f5` audit snapshot; B2 remains independently open.


## Recommendation

Keep Coair as the product/application base and integrate the RAG improvements
through a reviewed pull request. Do not replace main with the standalone RAG
repository. Do not combine merging code, changing hosting and migrating customer
data into one release.

Use `https://coair-test.duckdns.org` on AWS 63.184.32.196 as the isolated AI
reference environment. Ask Hasnain to create a preview of this integration branch
on Coair's existing deployment stack, using isolated service resources. Validate
that stack's auth, email, payments, storage and worker configuration before
merging. Prefer keeping the current production hosting if it supports the updated
AI runtime. An AWS production move is a separate decision requiring a full data
manifest, persistent storage, job capacity, deployment configuration and rollback.
The current review does not establish that Coair's existing host is unsuitable.

The review found two reproducible inherited blockers below. They should be fixed
before promotion. Report date proof and full-corpus report coverage also remain
open; engineering tests are not proof of equal report content quality.

## What changed

The application snapshot differs from main in **55 files: 3,194 inserted and
176 deleted lines**. This includes substantial tests, documentation and an
isolated deployment pipeline; it is not a wholesale application rewrite.
Seventeen backend/prompt files contain the AI/storage behavior work, with a small
Docker adjustment and four frontend/configuration files outside tests. This
review's additional test and documentation edits are outside those snapshot counts.

| Area | Integration changes |
|---|---|
| Agents | Bounded three-worker synthesis, preserved worker project/user context, durable usage attribution, project-scoped agent metadata and SQL hints. |
| Conversation | Selective follow-up context: last two messages, maximum 3,000 characters; standalone questions exclude unrelated history. |
| Retrieval and citations | Canonical file IDs, explicit selected-document enforcement, project filters, source-page preference, selected raw-source answer context. |
| Glossary | Bounded single-pass expansion, preventing recursive growth and excessive memory use. |
| Chronology/Word | RAG prompt structure and narrative report behavior, claim filtering, progress ordering, runtime model metadata, footnote/Word delivery checks. Failed chronology entries are hidden; forensic failure/retry behavior is retained. |
| Search/database runtime | Independent DuckDB cursors, persistent FTS dirty state/index reuse, corrected lexical result materialization. A hash-checked project corpus export/import tool was added. |
| Deployment | Dedicated hostname, containers, private data volumes, guarded releases, CI checks, readiness health behavior. Standalone Next.js output is conditional, preserving the normal build configuration. |

**Preserved:** account, organization, role, payment and OCR implementations were
not replaced with RAG's versions. Sixteen critical files were compared byte for
byte with main; all sixteen match. These include `auth.py`, `org_admin.py`,
`admin_orgs.py`, `commerce.py`, `files.py`, `document_service.py`, `ocr.py`,
`database.py`, organization/project/user/billing stores, CA accounting and core
authorization. Exact paths and hashes are in `release-review.json`.
Unchanged code can still fail because of an inherited defect or deployment
configuration; this comparison is not a blanket functional guarantee.

## Acceptance findings

| Requirement | Evidence and result | Release status |
|---|---|---|
| Bottom source chips open the original document at the side | Real browser login/MFA, persisted chat, bottom PDF chip, right PDF panel, enlarged image and closing the modal passed; image width 1,248 px, no JavaScript errors. See `source-panel-review.png`. | Passed on test environment. |
| Available documents and pages | Three sample PDFs/eight pages are the staging corpus. All three originals downloaded; all eight pages rendered successfully through the public API. | Sample acceptance only; not a full-corpus migration. |
| New native PDF | Upload → queue → ready in 2.21 s in the measured polling interval; original-download SHA-256 equals uploaded bytes; PDF preview passed. | Passed for one-page synthetic fixture. |
| Scanned PDF/OCR | Image-only PDF without a text layer → queue → embedding → ready in 4.76 s; one OCR page recorded; byte-identical original download and rendered preview passed. | Passed for one-page synthetic fixture. |
| New files searchable and cited | Actual chat answered both fixture dates and returned both canonical document IDs. Duplicate re-upload was skipped; original sample file IDs were unchanged. | Passed for the two uploaded fixtures; fixtures were deleted afterward. |
| Preview project isolation | A known document ID from the temporary project returned its text when requested through the Edinburgh project. | **Blocked: inherited defect B1.** |
| Accounts/demo requests/roles | Router tests exercise verified email proof, request approval/denial, invitation activation, MFA, company owners/members, project grants, module entitlements, demo limits and last-owner protection. | Broad local contracts pass except B2; external delivery/provider acceptance remains open. |
| Company edit/archive/restore | Frontend calls PATCH; backend returns 405. | **Blocked: inherited defect B2.** |
| Payment and quotas | Existing accounting/organization tests and mocked Stripe contracts run; company token-pool behavior retained. | Real Stripe/webhook/checkout has not been exercised on this isolated environment. |
| Database adapters | Earlier acceptance ran actual disposable PostgreSQL migrations, ownership, concurrent accounting and rollback; private staging uses its own stores. | Does not certify hosted Supabase configuration/RLS or migrate customer data. |
| Query/report quality and duration | Prior matched-data timing and Word artifacts remain in the four-stage report. Small samples vary in report coverage. | No full-corpus speed or content-quality equivalence claim. |

### B1 — project preview can expose another project's chunk text

**Severity: high; fix before promotion.** In
`api/backend/services/document_service.py`, `_get_project_content` first queries
chunks with `project_id`, but if that returns no rows, its fallback queries by
`doc_id`/filename without a project restriction. It can return those rows as text
without proving membership. Restricting the raw PDF path does not protect that
text response.

Reproduced through the public integration API using two projects accessible to
the demo owner and synthetic documents. A separate executable test with an
in-memory DuckDB containing only a foreign project's chunk reproduces the same
failure against the **main baseline source**. The implementation is byte-identical
between main and integration. Unauthorized production accounts were not used and
production Coair was not probed; exact cross-tenant exploitability on that runtime
has not been measured.

Required correction: prove active-project membership before any text or file
fallback. Keep legitimate shared/legacy corpus access behind an explicit scoped
membership rule. Do not remove project checks merely to make old citations open.
Regression witness: `api/tests/test_project_document_viewer_isolation.py` (currently
expected to fail until the defect is fixed). Recheck authorized shared-corpus
citations, foreign document IDs and filenames, empty projects and other companies.

### B2 — company PATCH route is missing

**Severity: functional release blocker.** `lib/coair/admin.ts:patchAdminOrg`
sends `PATCH /api/admin/orgs/{org_id}` for editing/archive operations.
`api/backend/api/admin_orgs.py` defines `OrgUpdate` but has no matching PATCH
handler. The archive/restore router test receives **405 Method Not Allowed**.
The same test fails with 405 against main baseline source in isolation.

Add the missing operator-authorized handler using existing organization store
operations, preserving ownership, limits and archive semantics. Test edit,
archive, restore, persistence and non-admin rejection. This review does not
silently change account-management behavior to hide the failure.

### Other open quality work

The chronology date verifier does not fully prove that a normalized event date
matches the evidence date. Earlier acceptance reproduced a mismatched normalized
date being accepted. Report event coverage also varies, and the matched target
report was flagged `thin_record`. Valid Word output and resolving footnotes do not
establish correct or complete content. Ground-truth chronology comparisons and
normalized-date validation are required before claiming report-quality parity.

## Data and deployment boundaries

Read-only registry inventory: AWS RAG has **206 records: 204 completed, 2 error**;
Coair test has **3 completed sample records** after temporary upload cleanup.
These are registry counts, not a reconciled full storage/vector inventory. The
three-document test environment was intentionally isolated; the difference does
not prove documents were deleted. It also means a full migration is **not done**.
The production Coair corpus and deployed version have not been authenticated and
reconciled in this review.

Do not copy the RAG account database over Coair's. Their ledger schemas differ
and physical DuckDB files are version-sensitive (RAG 1.5.5 versus Coair 2.0.0 in
the compared runtimes). Use native-version corpus export/import plus a separate
manifest of original files, hashes, pages, project ownership, chunks and vectors.
The corpus tool transfers chunks/search metadata, not original PDFs, vectors,
users, subscriptions or balances.

Staging deliberately disables production Supabase, S3/GCS, Stripe and email
provider connections. This makes qualification isolated but leaves real email
links/delivery, provider login/session behavior, object recovery and payment
webhooks unverified. Preserve those production integrations in Hasnain's preview;
use sandbox resources rather than pointing staging at customer stores.

The added GitHub workflow follows `integration/rag-agent-parity`. Merging into
main does not by itself enable this AWS pipeline for main. Existing Coair hosting
may instead deploy main automatically: Hasnain must confirm branch/environment
mapping before merging. Keep secrets, public API/auth origins, invitation/reset
URLs, CORS, storage mounts, Qdrant collections and worker/job settings explicit.
No production merge, DNS change, database replacement or code deployment was
performed during this review.

## Test execution and evidence

The final extended run executed **136 tests: 135 passed, 1 failed** in 129.07 s.
The remaining failure is B2. A separate two-test run against main baseline code
reproduced both B1 and B2. B1 is additionally reproduced through the integration
HTTPS API. These failures remain open; no runtime fix or bypass was deployed.

The org/commerce test harness was updated to isolate its process-global rate
limiter per fixture and follow the existing verified-email → invite activation
flow. Expectations now reflect the existing public package catalog, company
quota allocation and company module entitlements. Production authentication,
rate limits and account rules were not relaxed. The new project-preview
isolation test remains a failing witness until B1 is fixed.

The earlier integration CI passed 204 API tests plus 13 subtests, three real
PostgreSQL adapter tests and 152 frontend tests. Its selected test list did not
include these broader org/commerce or preview cases; that green run does not
supersede this review. Add the expanded cases to required CI when the blockers
are corrected.

`release-review.json` contains source hashes, final test counts, upload/OCR
measurements, original PDF hashes/page coverage and cleanup results. The real
browser screenshot is `source-panel-review.png`. Canonical raw execution logs
and JUnit XML are retained on AWS under
`/opt/coair-integration/qualification/release-review/`. Disposable review
containers used no network and temporary stores; no real emails/payments were
sent. The two temporary uploaded PDFs were deleted and their QA project archived.

## Developer acceptance checklist

1. Confirm the reviewed commit and the actual currently deployed Coair commit;
   create a preview on its existing stack, with rollback and isolated stores.
2. Fix B1 and B2; run their regression witnesses on baseline/fixed code and keep
   foreign-project access blocked while valid shared sources still open.
3. Exercise UI email verification → demo request → approval → invitation →
   password activation → MFA → first project; deny and duplicate requests;
   reset password, reinvite, logout and expired invitations/sessions.
4. Exercise platform admin, company owner and member permissions; promote/demote,
   last-owner protection, module grants, project grants/revocation and company
   archive/restore. Check both UI feedback and persisted API/store state.
5. Upload native/scanned/multipage PDFs and supported Office/spreadsheet formats.
   Check OCR, queue progress, failure/retry, indexing, deduplication, new-source
   retrieval, citation chips, every cited page, raw download and deletion cleanup.
6. Reconcile the full document manifest, project assignments, page/chunk/vector
   counts and hashes. Confirm restart/redeploy recovery from the actual object
   store; keep production data intact until reconciliation passes.
7. Run real provider sandbox email/auth/payment flows, Stripe webhook signature
   and retry/idempotency, plan/role transitions, token debits and exhausted quotas.
8. Compare AI reports against a known expected chronology on the full corpus;
   verify dates, completeness, Word layout/footnotes, progress and p50/p95 timings
   under realistic concurrent jobs. Agree acceptable thresholds before promotion.
9. Merge the integration PR only after sign-off. Deploy one immutable commit on
   the selected existing stack first. Evaluate an AWS production move separately.

## Message to Hasnain

> We integrated the stronger RAG agent workflows into a branch based on Coair
> main, while retaining Coair's account, organization, role and billing layers.
> Please review `integration/rag-agent-parity` and qualify a preview on your
> existing deployment stack before we merge it. AWS `coair-test.duckdns.org` is
> an isolated reference with three sample PDFs, not a complete data migration.
> The audit found two issues also reproducible in main: document preview can
> return another project's chunk text, and the company PATCH endpoint used for
> edit/archive/restore is missing. Please address these and validate demo request,
> invitation/activation, MFA, roles, payments, uploads/OCR, source-panel opening,
> complete corpus reconciliation and storage recovery. We should decide hosting
> separately after these checks, rather than merging and moving production in
> one step. Report-quality/date validation also remains an acceptance item.

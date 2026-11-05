# AWS / Azure application comparison

Observed on 2026-11-05. This is an application acceptance report, not a declaration
that production cutover is complete. The separate live Coair account database
has deliberately not been merged into the original AWS/RAG dataset.

## Deployment identities

| Address | Observed destination | Purpose |
| --- | --- | --- |
| `63.184.32.196` | AWS host, original `mvp-api` on loopback 8000 | Original RAG application and dataset |
| `coair-test.duckdns.org` | The same AWS host, separate Coair containers on 8200/3200 | Integration staging, not the original RAG process/database |
| `login.coair.ai`, `user.coair.ai`, `admin.coair.ai` | Vercel; IPv4 216.198.79.65 / 64.29.17.65 | Separate production Coair portals |
| `api.coair.ai` | 187.53.133.40, nginx API | Separate production Coair backend; not 63.184.32.196 |
| `coair.ai` | 77.37.53.253 / 77.37.83.36 | Separate website |
| `coair-azure-kadirsen.westeurope.cloudapp.azure.com` | 52.233.224.179; Azure VM `vm-coair`, West Europe | Coair application code with migrated original AWS/RAG data |

The active production domain is `coair.ai`, not `coair.com`. The latter did not
resolve in the DNS check. DNS addresses can change; API health and Vercel response
headers were also inspected. This does not establish the hosting provider of
187.53.133.40; it establishes that it is a different endpoint from the AWS/RAG IP.
The repository's `README.md`, `docs/DEPLOY.md`, `vercel.json` and API proxy route
agree with the observed Vercel/frontend plus separate VPS/API design. The production `api/scripts/deploy_vps.ps1` explicitly targets
`root@187.53.133.40` and builds the API on that VPS. The original RAG deployment
is separately documented in `api/docs/internal/LIGHTSAIL_DEPLOYMENT.md` for
`63.184.32.196`. This is repository evidence as well as DNS evidence. The VPS
and Vercel production environment variables have not been accessed or changed.

After fetching the remote on the inspection date, the Azure branch was zero
commits behind `origin/main` and 49 commits ahead before this report. The latest
main commit was `b5e1b56` (2026-10-28). This does not identify the exact running
commit on the separate production VPS: its health endpoint has no commit field,
and no authenticated VPS/deployment-state inspection was performed.

No production domain was switched. A separate alias such as `azure.coair.ai`
could point to Azure after acceptance, certificate and application origin
configuration. Redirecting `api.coair.ai` now would switch a separate live
customer/account dataset and is outside the approved AWS/RAG-only migration.

## Projects and corpus

Authenticated inventories used the same project and existing admin account on
both APIs. Both environments contain seven identical project IDs: one active
Edinburgh Tram Inquiry project (`0fb88a60b80648d5`) and six archived projects.
The demo account can see only that active Edinburgh project in both environments.

Both APIs list 7,411 indexed sources: 7,289 documents and 122 data files.
The sorted `(id, name, file_type)` inventory hashes are identical:
`5ca867a7c7fc583ed32fe8156d06f4ea74d3c2aabedd0a7fda69c731dabf85b2`.

Previously verified migration evidence: 7,664 original files, 17,866,632,994
bytes, equal complete-tree SHA-256
`2dbed6ba2e68d357057b9247895e2f5cc3edf5c7248b8c3a3a6d616d9a731039`;
156,218 restored collection points (156,200 scoped to Edinburgh). File counts
and indexed-source counts describe different inventories and must not be added.

Both APIs render ADS00004.pdf page 2 successfully, as a 17-page PDF. The returned
page text is identical (2,176 characters), and the rendered page image matches
byte-for-byte: 1,968,903 bytes, SHA-256
`601ad5c7d09b3f17d5fda7ebd6813fbd7f8eef3002176b0eb03f3a8ee90f1891`.
This checks the viewer content endpoint, not every PDF or browser highlight.

The source API lists 22 ready and 22 failed report jobs. Azure lists the same
number of ready jobs and suppresses failed chronology jobs as requested. The
underlying failed records remain available to the system; this is a visibility
change, not deletion of historical jobs.

## Retrieval compatibility finding

The same selected-file question initially returned a substantive cited answer
on AWS (26.092 seconds) and no relevant excerpts on Azure (25.134 seconds).
The restored vectors and PDF were present. The legacy library uses a filename
as its UI selector ID, while Qdrant owns a UUID in `doc_id` and the chunk mirror
has another stable document ID. Modern Coair correctly intersects selections
with project scope, but did not resolve registry-free legacy bulk aliases.

Commit `316bff48e4acd3d1388a11a42a6a6f6a6d20d4d8` resolves those aliases only
through the active project's durable inventory, rejects ambiguous IDs and
registered-name collisions, and matches only vectors without modern `file_id`.
Thirteen real-adapter/project-isolation tests passed locally in the API image.
No global filename OR or cross-project fallback was introduced.

## Upload routing finding

An unset public upload origin falls back to the separate live `api.coair.ai`
backend in the upstream client. Commit
`4509150499fdf6726832e838d5359fb7822c35ac` supplies the Azure image with an
explicit `<Azure origin>/api` upload base. Other branches retain their existing
build argument behavior. The Azure nginx API route streams uploads locally.
Two frontend regression cases cover the explicit-origin precedence and path
normalization. The final image must be verified before calling this resolved
in the deployed application.

## Runtime differences

Both use the same 768-dimensional local BGE embedding model, Qdrant collection,
hybrid retrieval/reranking flags and candidate/final/rerank values (30/6/15).
Azure uses Gemini for generation, not DGX local inference.

The source VM has 8 GiB RAM; the approved Azure VM has 4 GiB. Azure currently
uses a 512-MB DuckDB budget and two threads. These bound database memory and do
not cap document coverage or report output length. Bulk BM25 replaced repeated
scalar scoring; reference-score and real-corpus tests passed. A 0.781-second
retrieval benchmark is not end-to-end answer latency.

Source/Azure runtime versions at the initial comparison respectively:
DuckDB 1.5.5 / 2.0.0, FastEmbed 0.8.0 / 0.9.0, google-genai 2.19.0 / 2.33.0,
LlamaIndex core 0.14.24 / 0.14.25; both qdrant-client 1.18.0. Thus matching files
does not imply identical runtime behavior. Azure's dependency lock and tests
must remain part of acceptance. The existing client 1.18.0 versus Qdrant server
1.15.4 produces a compatibility warning; this is pre-existing on both sides and
needs a separately qualified client/server alignment, not an untested live upgrade.

## Same-question acceptance

Baseline questions:

1. Selected `ADS00004.pdf`: “Summarise the main points of ADS00004.pdf. State
   its date and purpose, and cite the supporting pages.” AWS answered in
   26.092 seconds. Its date/effective-date facts match the actual PDF page 2.
   Azure before the compatibility fix returned no excerpts in 25.134 seconds.
2. Project-wide: “Create a concise table of five dated events relating to the
   Tram Depot, with columns Date, Event and Source. Cite the supporting project
   documents.” AWS answered in 29.497 seconds, with five dated table rows and
   15 citation objects. Some rows describe the Jenners Depository Substation,
   so relevance to the requested depot needs human review; the existence of
   citations alone is not a correctness pass.
3. Spreadsheet: “For the Edinburgh Tram Inquiry project, how many records are
   in the INTC Register worksheet of BFB00055818.xlsx? Show the records in a
   table and cite the spreadsheet.” AWS took 74.918 seconds and incorrectly
   attributed three records from `cec01933545_contract_change_order_740e27`
   to BFB00055818.xlsx. The requested workbook's viewer resolves the INTC
   Register with five rows and different columns. This is a source-selection
   correctness failure in the baseline, not proof of an Azure migration loss.
   A simpler initial spreadsheet question was also rejected as off-topic on
   AWS; that failed attempt is not counted as a successful data answer.

4. The same spreadsheet question with the actual sidebar file ID selected:
   AWS took 40.472 seconds, correctly returned the five detailed INTC Register
   rows and separately explained the Change Count summary's 41 records. Both
   selected SQL tables belong to BFB00055818.xlsx. However, its response contains
   Markdown tables while `sql_artifact.preview_rows` and `columns` are empty;
   that is not proof of a functioning interactive SQL result grid.

The Azure API and web pair `4509150499fdf6726832e838d5359fb7822c35ac` was
manually bootstrapped after the runtime test/build steps passed. Public health
reports that exact commit and the sign-in page passed. The full GitHub run
`42098623074` completed successfully: 750 API tests, 13 subtests, four PostgreSQL
adapter tests, 60 Azure tests and 178 frontend tests. One API test is skipped.
Automatic deployment remains disabled and acceptance_complete remains false.

Post-deployment results so far:

- Selected ADS00004.pdf now answers correctly with the same 29 January 2004 /
  1 August 2003 dates and Development Partnership purpose as AWS. Its first
  request after process restart took 46.274 seconds; source AWS took 26.092.
  Azure returned 10 retrieved pages, merged into one document citation. This
  proves the selection defect is fixed, not that all summaries are equivalent.
- The depot timeline took 32.598 seconds on Azure versus 29.497 on AWS. Azure
  returned five rows and eight citation objects, focused on Gogar depot design
  and Employer's Requirements, while AWS included Jenners Depository Substation
  design tasks. These are different ranked evidence sets over identical data,
  not a missing-document migration issue. The Azure result's trailing P6
  explanation was irrelevant: the glossary expanded generic “project” into a
  Primavera PROJECT-table concept. Logs also show this expansion constraining
  an optional topic filter until lexical retrieval supplied the evidence.
  Glossary applicability needs follow-up, and document version/issue dates must
  not be accepted as proved real-world milestone dates without checking sources.

The selected-document Azure answer also exported as a valid DOCX (38,666
bytes, 31 explicitly bold runs, no raw Markdown heading markers, source name
present). This validates package structure and formatting markers, not a full
visual layout review or fresh chronology report generation.

The compiled Next.js assets contain the explicit Azure `/api` upload base;
public health through `/coair-api` identifies the correct Azure release.
A real upload/ingestion was not performed on the shared Edinburgh project to
avoid changing the corpus being compared.

The unselected, filename-only spreadsheet question also failed source selection
on Azure: 109.800 seconds, incorrectly reporting three records from the same
wrong Contract Change Order table. The actual SQL touched the risk register
and strategic-objectives tables too. The resulting `sql_artifact` has zero
preview rows/columns despite Markdown tables in the answer. This is a failed
correctness/latency acceptance case on both environments, not a passed answer
because HTTP returned 200. The Azure result also reported one data execution
error and attributed the answer's source_file_name to DLA00001495.xls.

The selected-workbook comparison passed source selection and numeric agreement:
Azure took 41.848 seconds versus AWS 40.472. Both used only the workbook's
`bfb00055818_intc_register_e5c92e` and `bfb00055818_change_count_6dbb40`
tables and returned five detail rows versus 41 summary records. Azure's five
values match AWS: 119,227.57; 100,832.72; 18,758.87; 39,220.16; 5,564.21.
The SQL artifact still has empty preview rows and columns in this multi-table
case. This is a textual/table-content check, not a browser interaction test.

| Fresh-conversation case | AWS seconds | Azure seconds | Result |
| --- | ---: | ---: | --- |
| Selected ADS00004.pdf summary | 26.092 | 46.274 | Core date/purpose agree after alias fix; Azure cold after restart |
| Five depot events | 29.497 | 32.598 | Both produce five rows; ranked sources differ; glossary noise remains |
| Workbook named in question, not selected | 74.918 | 109.800 | Both fail: wrong tables and wrong three-record attribution |
| Same workbook explicitly selected | 40.472 | 41.848 | Same five detail rows / 41 summary records |

These are single observations using the same account/project/question in fresh
conversations, not a statistical benchmark or a claim about concurrent load.
No source prompt, corpus cap or model setting was changed to make a case pass.

### Real Word export failure

The AWS timeline answer exported as a valid DOCX containing one native Word
table, bold runs and sources. The Azure timeline answer returned HTTP 500 during
DOCX export: the citation snippets for USB00000033_PART2.pdf and
USB00000033_PART3.pdf each contain a U+0004 control character extracted from the
PDF. `answer_docx._citations` passes that text straight to python-docx/lxml,
which rejects it as invalid XML. The simpler Azure summary export passed, so a
single successful export would have missed this source-dependent defect.
This bug remains unfixed in the deployed pair. Export boundaries must sanitize
XML-incompatible characters in all user/model/source text while retaining visible
content, source names, page anchors, tables and normal whitespace. Replaying
this exact answer is a required regression test.

## Required follow-up order

1. Bind an explicitly named, project-owned workbook to its actual catalog table
   set before semantic table ranking. Preserve selected-workbook scope and fail
   closed on missing/ambiguous identities. Prove both question-only and sidebar
   selection cases against the five-row/41-record fixture.
2. Sanitize XML-incompatible text at Word export boundaries and replay the
   failing timeline answer, including citation snippets and native tables.
3. Resolve legacy original paths through verified project-owned assets without
   changing canonical IDs; test original-sheet reading, SQL fallback and sources.
4. Prevent generic glossary terms such as “project” from forcing P6 context
   without query evidence. Compare source relevance and milestone/date support.
5. Qualify project-preserving cloud conversation backup/restore, fresh report
   generation, UI rendering and final migration/rollback before a domain cutover.

## Additional pre-cutover findings

- The original-sheet reader logs old Mac absolute paths from catalog metadata,
  for example under `/Users/kadirsen/Desktop/projects/ML_project_V2/data/`.
  Those originals are present in the migrated data tree, while the stale path
  makes sheet reading fail and fall back to imported SQL/parquet. The viewer's
  independently resolved parquet still works. Physical-path repair must retain
  canonical document IDs, project ownership and collision checks; blindly
  replacing catalog paths would change filename-derived identities.
- Conversation cloud synchronization currently scans only the user's immediate
  `*.json` files, whereas new project-scoped conversations live in subfolders.
  Local persistent storage remains authoritative and startup restore is disabled.
  Recursive, project-preserving backup/restore must be qualified before cutover;
  repeated “uploaded 142 conversation files” logs do not prove new project chats
  are backed up. No history was deleted to work around this.
- The demo's migrated usage exceeds its original one-million limit. Tests used
  existing unlimited admin2. A demo quota increase remains an owner decision;
  no billing history or usage was reset.
- Fresh chronology/forensic generation, full visual grid/highlight validation,
  final data delta reconciliation, off-VM mutable-state backup and automatic
  deployment/rollback qualification remain outside the completed comparison.
  AWS has not been retired and production Coair DNS has not been changed.
Tests use fresh conversations on the same Edinburgh project and the same admin
identity to avoid the migrated demo account's exhausted historical quota. No
quota, password, billing balance or live Coair account was reset for these tests.

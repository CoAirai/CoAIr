# Edinburgh documents in the protected DGX installation

The protected application originally used a separate, empty owner workspace.
The existing DGX source installation retained the Edinburgh corpus. The source
project `9526e46f951947d1` has now been copied into the protected installation,
preserving its immutable project/document identifiers and source locators.

The owner can select **Edinburgh Test** at `http://100.91.121.116:18082`.
The original empty **Documents** workspace still exists separately. Refreshing
the application loads the newly available project; no password changed.

## Scope and integrity

- 1,243 original files (approximately 2.17 GB) copied and SHA-256 verified.
- 51,063 existing project vectors reused with identical embedding configuration.
- 47,894 lexical chunks and 1,241 document-index records copied and compared with
  their source rows. Other projects' local rows remain unchanged.
- 31 table catalog entries and their Parquet files retained, along with immutable
  canonical artifacts and project metadata. No OCR/model re-ingestion was needed.
- 1,215 OCR/metadata review versions retained; page/OCR counts derived from the
  existing page metadata where available.
- Project-scoped canonical/event/jargon records copied, preserving their existing
  states. Source event memory had no materialized observation/cluster rows; the
  import does not claim to create stronger event extraction or repair old failures.
- Account, organization policy, password, billing, payment and token ledgers were
  not replaced. Project ownership was bound to the existing destination owner/org.
- The source's 1,241 completed files and two existing errors are preserved. The two
  failed files are password-protected spreadsheets requiring unlocked originals.

## Procedure and verification

`deploy/dgx/migrate_project_host.py` coordinates the read-only source mounts and
bounded copy phases. Preparation copies/hashes files and transfers vectors before
publication. `--apply` briefly stops both API writers for DuckDB consistency,
merges the scoped local/review/event stores, and publishes the project's ownership
last. Both APIs restart in `finally`, including on migration failure. The model
service is not restarted. Existing files with differing bytes are never overwritten.

Six isolation/integrity/resume tests passed in the qualified ARM64 runtime.
Normal API verification showed 1,243 visible files, and a project-authorized
original PDF download succeeded. The browser shows 1,211 documents and 32
spreadsheets under Edinburgh Test. A selected-document query using the local
model returned a grounded answer with one source citation in 7.37 seconds.
An account from another organization received HTTP 404 when requesting this
project. Query and authorization results are stored privately on the DGX in
`edinburgh-migration-validation.json`.

The protected API image remains `dgx-20261101-406dd68`; this is a dataset migration,
not an application/provider change. Private migration state/logs remain under
`/home/coair/coair-secure`; no runtime credentials are committed to the repository.

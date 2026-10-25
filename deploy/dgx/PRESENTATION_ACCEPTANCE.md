# DGX presentation and access release

Status: prepared in `codex/dgx-appliance-parity`, based on `feat/dgx-local-appliance`; not installed or accepted on Spark.
The device was offline during preparation on 25 October 2026.

## Changes

- Assistant headings and bold text render as formatting, including compact `###Summary` headings. Fenced code remains literal.
- Answer tables support filtering, ascending/descending sorting, horizontal scrolling and CSV/Excel downloads. Sorting and filtering never change the retained/exported result.
- SQL artifacts carry original column order, values, source workbook, row total and optional chart through conversation persistence and reload. Project-scoped source resolution is reused from the AWS integration branch.
- Word downloads include the question, answer, citation page anchors, SQL and retained typed rows. Existing chronology/forensic report download routes are unchanged.
- Excel workbooks preserve zero, false, headers and long integer identifiers; formula-looking source text is stored as literal text. Empty results retain their headings. Invalid or oversized exports return errors instead of silently dropping cells.
- The source panel no longer silently discards retained rows after the first 40.
- Local invitation, password reset and administrator password/status updates invalidate sessions through `UserStore.bump_token_epoch`; the earlier calls to a nonexistent `OpsStore` method were corrected.

No agent prompt, model, token allowance, payment policy, schema migration or GPU configuration was changed for this release. Existing appliance admission, account expiry, organization membership and project authorization remain in place.

## Export scope and memory

Downloads contain rows retained in the answer, not every row in the original workbook. The interface displays retained and total row counts. Earlier conversations that did not persist complete SQL artifacts cannot recover discarded data. Excel has a bounded formatter limit of 2000 retained rows and 60 columns; this is not an AI chronology generation limit.

The DGX compose files have no explicit API container memory ceiling. The 3 GB setting belongs to embedding. AWS integration's separate 2 GB API limit is not evidence of the DGX budget. Unified memory is shared with the local GPU model; removing resource/admission protections is not a quality qualification.

## Verification

| Check | Result |
| --- | --- |
| Markdown, Word, response building and persisted SQL tests | 100 passed |
| Local demo invitation, provisioning, XLSX, admission and pilot isolation tests | 40 passed |
| Cloud organization and authentication security contracts | 48 passed |
| Password reset and invitation contract | 1 passed |
| Frontend suite | 165 passed |
| TypeScript and Next.js production build | Passed; 55 pages generated |
| Browser presentation/export transport fixture | Passed |
| Spark ARM image, protection checks, tailnet HTTPS and real local reports | Pending: device offline |

Test counts are per run and overlap. An existing document-mapping expectation and the demo fixtures were updated to match actual schema fields and required user-context fields. The reset/invitation test now asserts that an unactivated invitation cannot sign in with a returned temporary password; OTP activation is covered independently. Cloud commercial-plan tests are run in cloud mode, because the local appliance intentionally has different password, storage and account rules.

Invitation-response security fix: production-mode invite responses no longer expose the internal OTP used by the email sender. The tests retain the production debug-off assertion.

Qualification uses disposable AWS containers with copied DGX source, not running customer services or customer accounts. Browser fixtures use synthetic data and stub session/source callbacks, the chart widget and download transport; actual DOCX/XLSX bytes are tested separately. This does not establish Qwen model parity with the cloud model or validate ARM/protected binaries.

## Resume deployment when Spark is online

1. Confirm `spark-9631` / `100.91.121.116` is online. The operator Mac's Tailscale connection has already been restored. Preserve the existing tailnet ACL and keep public Funnel disabled.
2. Capture current image IDs and the pilot compose configuration privately; use the existing backup/restore process for the pilot volumes. Do not copy or attach AWS/RAG production volumes, cloud databases or the development import inbox.
3. Transfer the reviewed source changes into the existing Spark source checkout. Build the API source candidate with `Dockerfile.pilot-api` against the existing local API image and the web candidate with `Dockerfile.web`. Reuse the existing model and embedding images; do not download another model.
4. Run focused tests against that candidate on Spark, including account invitations, password resets, project isolation, saved SQL results and real Word/Excel outputs. Build the device-bound protected API with `protection/build.sh`, explicitly setting `BASE_IMAGE` to the tested candidate. Retain the current protected image for rollback. Do not run raw source mounts in the customer pilot.
5. Change only the pilot API/web release images in its existing compose deployment. Preserve `demo.env`, protection secrets, admission settings, named volumes and the loopback gateway at port 18081. A failed health check requires restoring the previous image references; do not delete volumes.
6. Run `python3 deploy/dgx/check_tailscale.py` on Spark. If Serve is not configured, run the same script with `--activate-https` after tailnet HTTPS/Serve permission is enabled. The script refuses to configure the Mac and never enables Funnel.
7. Open the printed HTTPS address from an authorized tailnet client. Check sign-in, first password change, an active project's real document upload/OCR, cited source opening, fresh/reopened tabular answers, Word/Excel exports, chronology progress and real local-model report quality. Also attempt foreign-project document/query IDs and confirm denial. Record timing and GPU/host memory while one report is generated.

Release acceptance requires step 7. A successful frontend build, lifted memory cap or formatter test alone does not qualify the application for a customer cutover.

## Repeatable browser fixture

Use a disposable checkout with its normal frontend dependencies and test-only `esbuild` and Playwright available. From that checkout's root run `node deploy/dgx/tests/presentation-build.cjs`, serve the generated `presentation.html` and `presentation-ui.js` on loopback, then run `node deploy/dgx/tests/presentation-browser.cjs`. Set `COAIR_PRESENTATION_URL`, `PLAYWRIGHT_MODULE` or `PLAYWRIGHT_EXECUTABLE` when the server, module or browser path differs. Do not expose the fixture as a customer application route. The fixture stubs the chart widget; chart-shape validation is covered by `sqlArtifact.test.ts` and the real GPU/model chart experience remains a device acceptance check.

Passing check logs are in `deploy/dgx/validation/`. The browser fixture validates controls and download payloads; backend tests reopen real XLSX/DOCX bytes. No real customer email is sent by these tests.

## Follow-up alignment

The cloud and appliance now share exact quoted-date matching (including short schedule dates), independent event-date decisions, and unambiguous same-project legacy-vector selection. The appliance retains its tested source-preserving local drafting and can retain a proven month/year when an exact day is unsupported. The independent verifier still judges the temporal link to the event.

The native toolkit Word assembler and opt-in AI explanation are accessible from the tool page. AI text uses the answer heading/table formatter. Existing local auth, protected packaging and quotas remain in this branch. `DGX source contracts` runs local API/HTTP/ownership/export contracts and the frontend on pushes; it has no production deployment step and does not substitute for ARM/protected-image and real-device acceptance.

## Source qualification — 25 October 2026

The isolated source run passed 78 API tests (one cloud-only structured retry test deselected), including a real local HTTP structured-output recovery fixture with usage accounting, and 167 frontend tests. TypeScript and both default and explicit local-mode production builds passed. Shared Word/Excel export, compact heading/table formatting, selected legacy-vector isolation and chronology date proof repairs are included. These results do not qualify real ARM/protected images, device networking, GPU admission under load or Qwen report quality: Spark remained offline.

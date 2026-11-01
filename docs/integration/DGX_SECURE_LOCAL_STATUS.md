# DGX secure local installation — 1 November 2026

## Release and scope

- Working branch: `codex/dgx-secure-local`, based on `codex/long-document-evidence`.
- Current Coair main (`b5e1b56`) was merged while preserving the later RAG,
  long-evidence, chronology validation and final-answer streaming changes.
- The earlier DGX appliance work was merged selectively. Conflicting AI and UI
  implementations were retained from the current feature branch; local inference
  was connected to the current accounting and streaming boundary.
- Application release: `dgx-20261101-406dd68` (API source commit `406dd68`).
- Address: **http://100.91.121.116:18082**, reachable through Tailscale.
- The existing DGX installation on port 8080 and its document corpus remain
  separate. This installation has its own PostgreSQL, Qdrant and file volumes.
  Its owner workspace starts empty; synthetic checks use a different organization.
- The original `ML_project_V2` RAG checkout remains on `dev` at `77c5295`, with
  existing uncommitted changes preserved. Those files were not silently replaced
  or treated as a committed, qualified deployment.

## Local inference and resource policy

The existing DGX Qwen service is reused: `qwen3.6-35b-a3b`, served by vLLM 0.29.0.
The existing authenticated local embedding service is reused too. No second GPU
model is started. The API has no configured Gemini, OpenAI, Anthropic, Z.AI,
Supabase or outbound email credentials.

The model has a 131,072-token context and a configured 32,768-token output ceiling.
Chat starts at 8,192 output tokens and structured long reports at 16,384; a cut-off
may regenerate once from the same evidence with the reserved larger output budget.
Exact local tokenization checks input plus output before generation. Large evidence
is processed through bounded windows/reviewers/sections, rather than inserting an
entire corpus into one context. These are finite per-call budgets, not a claim that
all possible documents fit in one request or that every report exhausts the corpus.

There is no Docker RAM cap on the API (`Memory=0`). Concurrency remains bounded;
removing a RAM cap does not guarantee that arbitrary workloads cannot exhaust RAM.

## Security controls

- API: UID 1000, read-only root filesystem, all Linux capabilities dropped,
  `no-new-privileges`, explicitly writable dedicated data/cache/log/temp volumes.
- Web and gateways are also read-only; nginx runs as UID 101. Databases have no
  published host ports. The application networks are internal, and the model
  proxy exposes only the fixed local model/tokenizer routes with buffering off.
- API outbound TCP to a public Internet address was blocked in a runtime probe.
  The public application port binds only to the Tailscale IP.
- Local password creation/reset is validated at the shared user-store boundary:
  at least 12 characters, at most 72 UTF-8 bytes. Existing cloud password policy
  and existing password verification remain unchanged.
- 356 proprietary Python modules and both chronology prompt contracts are
  AES-256-GCM encrypted. Four critical modules and the launcher are ARM64 Cython
  extensions. The signed manifest covers the packaged application files.
- An Ed25519-signed software license checks the machine-ID hash and device key.
  Runtime key/license files are private, read-only mounts, not image layers or
  environment variables. The private signing key stayed on the Mac.
- The final runtime is flattened into a scratch image. Every saved image layer
  is audited for plaintext application Python/prompt files and key files.

This is **software-key protection**, not TPM-backed or root-resistant protection.
A device administrator can recover keys or process memory. Browser JavaScript
remains inspectable. Older development sources/images that predated this work are
preserved on this development DGX; this disk is not a clean customer handover.
Document/database volumes are not claimed to be encrypted by this application
packaging. This work is not a complete penetration test or dependency CVE audit.

## Corrected issues found during qualification

1. The standalone PostgreSQL migration assumed Supabase's `anon`,
   `authenticated` and `service_role` existed. Grants/revocations now check role
   existence while always enabling RLS on the provider-key registry.
2. Local queue admission and the orchestrator both started the same progress
   record. Owner-preserving handoff now works without weakening cross-user
   request-ID protection. Unexpected stream failures are logged server-side.
3. Local JSON/schema recovery, cut-off accounting and reasoning-tag filtering
   are connected to the current final-answer stream; cloud fallback is forbidden.
4. Uploaded spreadsheets enter semantic search as bounded cell-text pages as
   well as SQL tables. A failed embedding does not become a completed upload.
5. Local document ingestion now creates the versioned OCR/metadata review
   baseline. Page/OCR counters survive restart using project-scoped persisted
   counts without loading all page text into the file-list response.
6. A duplicate SQL-artifact TypeScript property introduced during merging was
   removed. The local UI builds with local mode and production debug codes off.
7. Company-owned local account creation/reset cannot bypass the local password
   strength rule by using a different account-management endpoint.

## Validation

- Final expanded API suite: **741 passed, 13 subtests passed, 1 skipped**.
  The skipped test is PostgreSQL-specific and passed in the separate PostgreSQL
  qualification. The suite ran without Internet access; `pip check` also passed.
- UI: 174 tests across 44 files passed, followed by the ARM64 Next.js build.
- Post-fix stream/admission/history/agent tests: 59 passed.
- Post-fix OCR/review/viewer/local-ingestion tests: 70 passed.
- Standalone PostgreSQL without Supabase roles: 3 tests passed.
- Disposable PostgreSQL with Supabase roles: 4 tests passed, including RLS checks.
- Protection unit tests: 9 passed. Missing key, wrong key, wrong device and
  modified payload all refused startup with exit 78.
- Real Qwen transport: structured JSON validated; 78 deltas streamed with provider
  usage present. That short transport probe took about 1.1 seconds.
- Final post-restart application check: project isolation returned 404 for
  another organization; PDF/scanned PDF/Excel remained ready; the scanned source's
  extracted text and correct page/OCR count survived API restart. A source-backed
  Markdown table streamed in **313 deltas**, with the first final delta at **1.92
  seconds** and completion at **7.34 seconds** while a report was also running.
  Word, Excel, chronology Word and toolkit-evidence delivery worked.
- A fresh chronology job on the final release completed in **15.47 seconds**.
  Reusable evidence/steps may be cached; this is not a cold full-corpus benchmark.
- Runtime company-user checks verified weak-password rejection, strong-password
  creation, owner/member role changes and account deactivation in the isolated
  test organization.
- All **210** tracked API implementation/configuration/migration files matched
  the release build before encryption. The signing key remained on the Mac.

These timings are fixture measurements, not Edinburgh-scale performance promises.
The test organization contains clearly labelled synthetic evidence; no conclusion
of customer-corpus quality equivalence is drawn from it.

The final end-to-end and restart results are recorded alongside this document's
release in `/home/coair/coair-secure/qualification-results.json` and private
qualification logs. Access details are in `/home/coair/coair-secure/access.json`
and the Mac's private release directory; passwords are not included in this report.

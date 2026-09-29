# DGX protected pilot validation — 2026-09-29

Device: spark-9631, NVIDIA GB10, ARM64. Release: `20260929-protected-pilot-1`.
API image: `coair-api:dgx-protected-pilot`.
Image ID: `sha256:f8a1093e6b9d2a5e37fec8f29a57db91ebff3b1f12d98e69498c44d3c9c52e02`.

## Passed

- Nine local protection tests: round-trip/no plaintext, missing/wrong key, other
  device, forged manifest/license, modified ciphertext (hash and GCM tag checks),
  virtual module filenames.
- Four negative tests against the actual ARM64 image: missing key, wrong key,
  different machine identity, modified encrypted bundle. Each exited 78 with the
  explicit protected-startup refusal. No live files were modified by these tests.
- Actual saved image archive: both filesystem layers inspected. Zero application
  Python/C/Cython/source-map files, open chronology prompt contracts, or named
  private key files in image layers. Required third-party runtime Python libraries
  under site-packages are outside this proprietary application-source check.
- Runtime: 333 encrypted Python modules, four compiled application modules plus
  compiled launcher, two encrypted chronology prompt resources; prompt loading and
  metadata schema creation successful. Signing key never sent to DGX. Device key
  supplied via read-only mount, not embedded in the image.
- All 28 targeted chronology/metadata/pilot/atomic-graph regressions passed inside
  the protected image, with its real protected importer activated.
- Deployment healthy; API, sign-in, chronology and vector runtime checks passed.

## Real application acceptance (local Qwen3-8B)

An image-only fictional PDF was uploaded via the real API into the separate device
acceptance project `cab5c8437f94415c`, never the Edinburgh corpus.
File: `2b7be979549d7e6d`; report: `8ebca394356c4971b997`.

- OCR recovered Alice Morgan, Robert Hayes, South Wharf and the dated events.
- Metadata correctly returned document date `2010-09-20`.
- Ingestion/index-ready: 25.12 seconds for this single-page sample.
- Chat correctly answered the approval question and cited the uploaded document:
  9.50 seconds.
- Chronology completed: 115.45 seconds. Approval remained `2007-04-12`, completion
  `2007-04-14`; upload year 2026 was not used as an event date.
- Word export downloaded and ZIP structure verified: 37,816 bytes.
- Standalone integrity verification plus bundle unlock measured 0.042 seconds.
  This is a single measurement, not a benchmark or total application startup time.
  There was no controlled before/after performance comparison.

Raw device evidence: `/home/coair/protection-build/` contains `check.log`,
`regression-tests.log`, `negative-tests.json`, `image-audit.json`, `acceptance.json`,
`acceptance.docx`, and the saved protected API image archive. The archive is the
API only, not a full offline appliance installer. The prior whole-appliance archive
has not been rebuilt by this work.

## Not validated or not protected

No physical OS reboot, WAN-disconnection test, full repository suite, browser
visual audit or independent penetration test was performed in this change.
Development sources, compiler outputs and old source-bearing images remain on this
**development device**. Root can still obtain plaintext through development files,
key access, memory inspection, identity spoofing or launcher modification. The
license uses software machine identity, not a TPM-protected key. Browser assets
remain inspectable. Customer data volumes are not newly encrypted by this work.

The pilot is suitable for evaluating protected packaging and application
compatibility. It is not yet a source-confidential customer handover image.

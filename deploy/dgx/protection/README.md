# Protected DGX development pilot

This is an opt-in, software-key protection pilot, not a root-resistant appliance.
Development source, earlier images and build trees deliberately remain on the DGX
for ongoing development and rollback. **Do not hand this development disk to a
customer as a source-protected product.** A clean customer installation, account
restrictions, firmware/boot policy and TPM key provisioning are separate work.

## Protection boundary

- Four application modules (chronology date validation, prompt loading, JSON repair,
  local metadata) and the launcher are ARM64 Cython extensions.
- Remaining application/vendor Python sources are AES-256-GCM encrypted together
  with both chronology prompt contracts. Imports execute decrypted source in memory;
  no decrypted Python files or prompt files are written to the application directory.
- An Ed25519-signed manifest covers packaged application files. A signed pilot
  license binds the software key to the hash of the host machine ID.
- Device key and license are read-only mounts, not image layers, build arguments,
  environment variables or repository files. The signing private key stays on the
  developer machine. The public verification key is compiled into the launcher.
- The final image copies a prepared filesystem into `FROM scratch`. It does not
  inherit development image layers containing deleted sources.
- Third-party interpreter/site-packages, browser JavaScript, static templates and
  database migrations are not claimed to be secret. Required notices remain.

Root can copy the key, spoof machine-id, read process memory, or replace the
launcher. A signed software license therefore discourages ordinary image copying;
**it is not hardware binding, anti-debugging, DRM certification or a TPM seal**.
Prompt text necessarily reaches the local model. This is not a penetration test.
Do not embed valuable secrets in model prompts. This pilot does not encrypt the
customer document/database volumes, change SSH/root permissions, or implement
fleet updates, revocation, subscription metering or license expiration.

## Build and keys

Run `test_protection.py` on the developer machine with `cryptography` installed.
Build a tested development API image on the DGX first: `BASE_IMAGE` must contain
exactly the intended application release. Do not assume this script syncs all
application changes; it overlays only the protected prompt loader and launcher.
Then, from the developer machine:

```sh
PROTECTION_PYTHON=/path/to/python-with-cryptography \
  deploy/dgx/protection/build.sh coair@DGX_ADDRESS release-id
```

The builder creates a new remote build directory, compiles using a disposable
compiler image, fetches the app tree, encrypts/signs **locally**, then transfers only
the protected runtime build context back. The existing server is not switched.
`COAIR_SIGNING_HOME` defaults to `~/.coair-release-secrets/dgx-pilot`; keep this
restricted directory backed up securely. `DGX_SSH_KEY` selects the SSH key.
Never put signing.key in a customer image or copy it to the customer device.
Build output on the development DGX still includes plaintext sources; clean-device
provisioning must exclude these directories and compiler/development images.

Provision `device.key` and `license.json` from the developer secrets directory into
`deploy/dgx/protection-secrets/` on the DGX (directory 0700, files 0600). Device keys
must differ between customer devices. The current helper uses one signing/key
pair per secrets directory; it is a pilot, not a fleet key-management service.
Tag the candidate as `coair-api:dgx-protected-pilot` only after acceptance tests.

## Check, enable and rollback

Use both compose files for protected operation; base compose alone intentionally
selects the source-bearing development image. On the DGX:

```sh
bash deploy/dgx/protection/manage.sh status
bash deploy/dgx/protection/manage.sh enable
bash deploy/dgx/protection/manage.sh rollback
```

`enable` is for an already validated candidate. Check active jobs first; the helper
does not schedule maintenance, drain jobs, back up data, or automatically roll back.
`rollback` restores the retained development image with the same document/database
volumes. In this pilot there is no database migration. Do not use this shortcut for
future releases with incompatible database changes.

To validate the candidate before switching:

```sh
docker compose -f deploy/dgx/compose.yaml -f deploy/dgx/compose.protected.yaml \
  run --rm --no-deps \
  -v "$PWD/deploy/dgx/protection/check.py:/tmp/check.py:ro" api python /tmp/check.py
python3 deploy/dgx/protection/test_image.py \
  --secrets "$PWD/deploy/dgx/protection-secrets" \
  --ciphertext /path/to/protected/runtime/app/protection/application.enc
```

The negative tests use temporary files and disposable containers. They require
exit code 78 and the protected-startup refusal, rather than treating any crash as
successful protection. No customer files or live secrets are changed.

Developer-side source modules remain usable without the protected manifest. The
protected image fails closed when the signed package/key/license is unavailable.
See VALIDATION.md for the actual device test results and outstanding limitations.

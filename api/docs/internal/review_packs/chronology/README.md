# Chronology review-pack templates

These files are the maintained documentation templates for the read-only
Chronology technical review pack. They are not the handover artifact: links
such as `source/...` and the revision placeholders are resolved only during the
build.

Build and verify the current committed Chronology sources with:

```bash
python3 scripts/build_chronology_review_pack.py
python3 scripts/build_chronology_review_pack.py --verify \
  dist/chronology-review-pack-<commit>.zip
```

The builder uses explicit full-file and AST-symbol allowlists. It refuses to
package an included source that differs from the named Git revision, and it
rejects databases, document binaries, runtime-data paths, symlinks and common
credential formats.

To change review scope, update the allowlists in the builder and the explanatory
documents together, then run `tests/test_chronology_review_pack.py`.

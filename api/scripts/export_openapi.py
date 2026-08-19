#!/usr/bin/env python3
"""
Dump the FastAPI OpenAPI schema to docs/superadmin-api/openapi.json.

Used to keep the integration pack we hand to external client developers in sync
with the code. Importing the app is enough — the lifespan never runs, so this
touches no vector store, no model and no network.

    python scripts/export_openapi.py [--output PATH]

Note: several admin handlers are annotated `-> dict`, so their response schemas
come out empty. API_REFERENCE.md, not this file, is the authoritative contract.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

DEFAULT_OUTPUT = PROJECT_ROOT / "docs" / "superadmin-api" / "openapi.json"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = ap.parse_args()

    # security.py refuses to import without a secret. Any value works: we only
    # read the route table, never issue or verify a token.
    os.environ.setdefault("JWT_SECRET", "openapi-export-placeholder")

    from backend.main import app

    schema = app.openapi()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")

    paths = schema.get("paths", {})
    admin = [p for p in paths if p.startswith("/api/admin")]
    print(f"wrote {args.output} — {len(paths)} paths, {len(admin)} under /api/admin")
    return 0


if __name__ == "__main__":
    sys.exit(main())

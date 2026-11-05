"""Plan immutable object keys from a stable inventory, then verify Blob bytes.

Never uploads, deletes, rewrites document IDs, or certifies database migration.
Run verify with the API environment and PYTHONPATH pointing to api/.
"""
import argparse
import hashlib
import json
from pathlib import PurePosixPath

from inventory import index, write_report


def plan_assets(inventory):
    objects = []
    excluded = []
    for name, row in index(inventory).items():
        key = None
        if row["kind"] == "asset":
            if name.startswith("data/") and not any(part.startswith(".") for part in PurePosixPath(name).parts):
                key = "uploads/" + name.removeprefix("data/")
            elif name.startswith("storage/canonical_events/") and name.endswith("/canonical-text.jsonl.gz"):
                key = "canonical-events/" + name.removeprefix("storage/canonical_events/")
            elif name.startswith("storage/parquet/") and name.endswith(".parquet"):
                key = "tables/" + name.removeprefix("storage/parquet/")
        if key:
            objects.append({"source_path": name, "key": key, "size": row["size"], "sha256": row["sha256"]})
        else:
            excluded.append(name)
    if not objects:
        raise ValueError("No original/canonical/parquet assets to plan")
    return {"schema": 1, "objects": objects, "excluded_requires_separate_restore": excluded,
            "registry_identity": inventory.get("registry_identity"), "migration_accepted": False}


def verify_assets(plan, client):
    from azure.core import MatchConditions
    from azure.core.exceptions import ResourceNotFoundError
    from src.azure_blob_storage import validate_key
    if plan.get("schema") != 1 or not plan.get("objects"):
        raise ValueError("Unsupported or empty Blob plan")
    results, seen = [], set()
    for row in plan["objects"]:
        key = validate_key(row["key"])
        if key in seen or not key.startswith(("uploads/", "canonical-events/", "tables/")):
            raise ValueError("Unexpected or duplicate Blob plan key")
        seen.add(key)
        try:
            blob = client.get_blob_client(key)
            properties = blob.get_blob_properties()
            digest = hashlib.sha256()
            size = 0
            # Verify remote content, not only a size or user-supplied metadata hash.
            for chunk in blob.download_blob(etag=properties.etag, match_condition=MatchConditions.IfNotModified,
                                            max_concurrency=1).chunks():
                digest.update(chunk)
                size += len(chunk)
            ok = size == row["size"] == properties.size and digest.hexdigest() == row["sha256"]
            results.append({"key": key, "ok": ok, "error": "" if ok else "content_mismatch"})
        except ResourceNotFoundError:
            results.append({"key": key, "ok": False, "error": "missing"})
        except Exception as exc:
            results.append({"key": key, "ok": False, "error": type(exc).__name__})
    return {"asset_bytes_verified": all(row["ok"] for row in results), "objects": results,
            "migration_accepted": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "verify"))
    parser.add_argument("input")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        with open(args.input) as handle:
            data = json.load(handle)
        if args.command == "plan":
            report = plan_assets(data)
        else:
            from src.azure_blob_storage import container_client
            report = verify_assets(data, container_client())
        write_report(args.output, report)
        print(json.dumps({"report_written": True, "migration_accepted": False}))
        return 0 if args.command == "plan" or report["asset_bytes_verified"] else 1
    except Exception as exc:
        # Do not emit Azure exception URLs or credentials.
        print(json.dumps({"report_written": False, "error": type(exc).__name__}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

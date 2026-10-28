"""Compare native module outputs against an explicitly supplied reference engine tree.

Run once per engine in disposable containers; never imports Streamlit or sends prompts.
"""
import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, "/app")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-root")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    from backend.services.forensic_toolkit import engine
    if args.reference_root:
        engine.VENDOR_ROOT = Path(args.reference_root)
        sys.path.insert(0, str(engine.VENDOR_ROOT))
    root = engine.VENDOR_ROOT
    namespace = {}
    # Use the same reviewed XERs, event and parameters as the upstream engine contract.
    exec(compile(Path("/app/tests/test_forensic_engines.py").read_text(), "engine-fixtures", "exec"), namespace)
    namespace["VENDOR_ROOT"] = root
    result = {"modules":{}, "fixture_hashes":{}}
    for programme in namespace["_programmes"]():
        result["fixture_hashes"][programme["name"]] = hashlib.sha256(Path(programme["file_path"]).read_bytes()).hexdigest()
    for slug in engine.MODULE_DEFINITIONS:
        output = engine.run_module(slug, namespace["_programmes"](), namespace["PARAMETERS"][slug], prior_runs=[])
        artifacts = output.pop("_artifacts")
        excel = []
        from openpyxl import load_workbook
        for artifact in artifacts:
            if artifact["kind"] == "excel":
                workbook = load_workbook(io.BytesIO(artifact["content"]), data_only=False)
                excel.append({sheet.title:list(sheet.values) for sheet in workbook})
        result["modules"][slug] = {"output":output, "excel":excel,
            "artifact_kinds":sorted(artifact["kind"] for artifact in artifacts)}
    Path(args.output).write_text(json.dumps(result, indent=2, default=str))
    print("Completed",len(result["modules"]),"native modules",flush=True)

if __name__ == "__main__":main()

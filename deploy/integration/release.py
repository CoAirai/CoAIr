"""Deploy only the isolated integration stack; never use production compose files."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess


ROOT = Path("/opt/coair-integration")
IMAGE = re.compile(r"ghcr\.io/coairai/coair-integration-(api|web):[0-9a-f]{40}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-image", required=True)
    parser.add_argument("--web-image", required=True)
    args = parser.parse_args()
    if not IMAGE.fullmatch(args.api_image) or not IMAGE.fullmatch(args.web_image):
        parser.error("Only immutable Coair integration image tags are accepted")
    if "-api:" not in args.api_image or "-web:" not in args.web_image:
        parser.error("API and web images must match their service roles")
    if args.api_image.rsplit(":", 1)[1] != args.web_image.rsplit(":", 1)[1]:
        parser.error("API and web images must identify the same commit")
    if ROOT.resolve() != ROOT or not (ROOT / "api.env").is_file():
        parser.error("Provision the isolated integration directory and api.env first")
    for directory in ("storage", "data", "provider-keys", "qdrant"):
        if not (ROOT / directory).resolve().is_relative_to(ROOT):
            parser.error("Integration volumes must remain inside the isolated directory")
    compose = Path(__file__).with_name("compose.yml").resolve()
    previous_path = ROOT / "release.json"
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else None
    target = {"INTEGRATION_API_IMAGE": args.api_image,
              "INTEGRATION_WEB_IMAGE": args.web_image}
    env = {**os.environ, **target, "INTEGRATION_ROOT": str(ROOT)}
    command = ["docker", "compose", "--project-name", "coair-integration",
               "--env-file", str(ROOT / "compose.env"), "-f", str(compose)]
    subprocess.run(command + ["pull"], env=env, check=True)
    try:
        subprocess.run(command + ["up", "-d", "--wait", "--wait-timeout", "240"],
                       env=env, check=True)
    except subprocess.CalledProcessError:
        if previous:
            subprocess.run(command + ["up", "-d", "--wait", "--wait-timeout", "240"],
                           env={**env, **previous}, check=True)
        raise
    temporary = previous_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(target, indent=2) + "\n")
    temporary.replace(previous_path)
    print("Integration release healthy; production stack was not targeted")


if __name__ == "__main__":
    main()

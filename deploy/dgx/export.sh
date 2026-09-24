#!/usr/bin/env bash
# Run on the validated ARM64 build host. No customer data or credentials included.
set -euo pipefail
cd "$(dirname "$0")"
target="${1:?Provide a new output directory}"
mkdir "$target"
cp compose.yaml compose.model.yaml nginx.conf model-proxy.conf.template setup.py install.sh README.md "$target/"
docker save -o "$target/images.tar" coair-api:dgx-local coair-web:dgx-local coair-embedding:dgx-local postgres:16-bookworm qdrant/qdrant:v1.15.4 nginx:1.28-alpine
(cd "$target" && sha256sum images.tar > images.tar.sha256)
docker image inspect coair-api:dgx-local coair-web:dgx-local coair-embedding:dgx-local --format '{{.RepoTags}} {{.Id}} {{.Architecture}}' > "$target/image-manifest.txt"
echo "Exported application package to $target. BGE GPU weights are included; Qwen LLM weights are separate. See README."

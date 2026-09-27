#!/usr/bin/env bash
# Run on the validated ARM64 build host. No customer data or credentials included.
set -euo pipefail
cd "$(dirname "$0")"
target="${1:?Provide a new output directory}"
mkdir "$target"
cp compose.yaml compose.model.yaml nginx.conf model-proxy.conf.template setup.py install.sh check.sh README.md PILOT_QUICK_START.md "$target/"
images=(coair-api:dgx-local coair-web:dgx-local coair-embedding:dgx-local postgres:16-bookworm qdrant/qdrant:v1.15.4 nginx:1.28-alpine)
docker image inspect "${images[@]}" --format '{{.RepoTags}} {{.Id}} {{.Architecture}}' > "$target/image-manifest.txt"
docker save -o "$target/images.tar" "${images[@]}"
# Refuse to certify an archive if a concurrent build moved one of its tags.
current_manifest=$(docker image inspect "${images[@]}" --format '{{.RepoTags}} {{.Id}} {{.Architecture}}')
if [[ "$current_manifest" != "$(cat "$target/image-manifest.txt")" ]]; then
  echo 'Images changed during export. Re-run into a new directory after builds finish.' >&2
  exit 1
fi
(cd "$target" && sha256sum images.tar > images.tar.sha256)
echo "Exported application package to $target. BGE GPU weights are included; Qwen LLM weights are separate. See README."

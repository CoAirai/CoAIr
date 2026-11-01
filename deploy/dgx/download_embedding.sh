#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
model_dir="${1:-$PWD/embedding-model}"
mkdir -p "$model_dir"
model_dir="$(cd "$model_dir" && pwd)"
docker run --rm --user "$(id -u):$(id -g)" -e HF_HOME=/tmp/hf \
  -v "$model_dir:/models" --entrypoint python3 \
  vllm/vllm-openai@sha256:c2914767605584b6d8f45686b82de173ecc99e781897aa3d0a66dacd72c51ae1 \
  -c 'from huggingface_hub import snapshot_download; snapshot_download("BAAI/bge-base-en-v1.5", revision="a5beb1e3e68b9ab74eb54cfd186867f64f240e1a", local_dir="/models", allow_patterns=["*.json","model.safetensors","vocab.txt"])'

"""Pinned Qwen3.6 NVFP4 profile for the existing DGX Spark model service."""
import ipaddress
import os
import socket
import time

ip = os.environ["VLLM_BIND_IP"]
if ipaddress.ip_address(ip) not in ipaddress.ip_network("100.64.0.0/10"):
    raise SystemExit("VLLM_BIND_IP must be a Tailscale IPv4 address")
if len(os.environ.get("VLLM_API_KEY", "")) < 64:
    raise SystemExit("Set VLLM_API_KEY before starting")
while True:
    try:
        with socket.socket() as sock:
            sock.bind((ip, 0))
        break
    except OSError:
        time.sleep(5)

os.execvp("vllm", [
    "vllm", "serve", "nvidia/Qwen3.6-35B-A3B-NVFP4",
    "--revision", "1355db6a052410cfd62085d94b58866fd0f2c3c5",
    "--tokenizer-revision", "1355db6a052410cfd62085d94b58866fd0f2c3c5",
    "--served-model-name", "qwen3.6-35b-a3b",
    "--host", ip, "--port", os.getenv("VLLM_PORT", "8000"),
    "--tensor-parallel-size", "1",
    "--max-model-len", "131072",
    "--max-num-seqs", "4",
    "--gpu-memory-utilization", "0.4",
    "--kv-cache-dtype", "fp8",
    "--attention-backend", "flashinfer",
    "--moe-backend", "marlin",
    "--max-num-batched-tokens", "8192",
    "--enable-chunked-prefill",
    "--enable-prefix-caching",
    "--reasoning-parser", "qwen3",
    "--language-model-only",
    "--default-chat-template-kwargs", '{"enable_thinking":false}',
    "--no-enable-log-requests",
])

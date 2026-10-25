"""Private, offline model service for clean office installations."""
import os
if len(os.environ.get('VLLM_API_KEY',''))<64:raise SystemExit('Missing private model key')
os.execvp('vllm',['vllm','serve','/models','--tokenizer','/models',
 '--served-model-name','qwen3.6-35b-a3b','--host','0.0.0.0','--port','8000',
 '--tensor-parallel-size','1','--max-model-len','131072','--max-num-seqs','4',
 '--gpu-memory-utilization','0.4','--kv-cache-dtype','fp8','--attention-backend','flashinfer',
 '--moe-backend','marlin','--max-num-batched-tokens','8192','--enable-chunked-prefill',
 '--enable-prefix-caching','--reasoning-parser','qwen3','--language-model-only',
 '--default-chat-template-kwargs','{"enable_thinking":false}','--no-enable-log-requests'])

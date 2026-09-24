"""Offline, authenticated BGE GPU embedding service; no host port or WAN route."""
import hmac
import os
import threading
from typing import Annotated

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, StringConstraints
from transformers import AutoModel, AutoTokenizer

MODEL = 'BAAI/bge-base-en-v1.5'
KEY = os.environ['EMBEDDING_API_KEY']
if len(KEY) < 24:
    raise RuntimeError('EMBEDDING_API_KEY must be a generated secret')
if not torch.cuda.is_available():
    raise RuntimeError('GPU embedding requires CUDA; no implicit CPU fallback')
torch.cuda.set_per_process_memory_fraction(0.006)
torch.set_num_threads(2)
tokenizer = AutoTokenizer.from_pretrained('/models', local_files_only=True)
model = AutoModel.from_pretrained('/models', local_files_only=True,
    dtype=torch.float16, attn_implementation='sdpa').to('cuda').eval()
lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
Text = Annotated[str, StringConstraints(min_length=1, max_length=65536)]


class EmbeddingRequest(BaseModel):
    model: str = MODEL
    input: Text | Annotated[list[Text], Field(min_length=1, max_length=64)]
    encoding_format: str = 'float'


@app.get('/health')
def health():
    return {'status': 'ok', 'model': MODEL, 'device': 'cuda', 'dimensions': 768}


@app.post('/v1/embeddings')
def embeddings(body: EmbeddingRequest, authorization: str = Header(default='')):
    if not hmac.compare_digest(authorization, 'Bearer ' + KEY):
        raise HTTPException(401, 'Invalid embedding credentials')
    if body.model != MODEL or body.encoding_format != 'float':
        raise HTTPException(400, 'Unsupported model or encoding')
    texts = [body.input] if isinstance(body.input, str) else body.input
    vectors = []
    tokens = 0
    with lock, torch.inference_mode():
        for start in range(0, len(texts), 8):
            batch = tokenizer(texts[start:start+8], padding=True, truncation=True,
                              max_length=512, return_tensors='pt').to('cuda')
            tokens += int(batch['attention_mask'].sum().item())
            hidden = model(**batch).last_hidden_state[:, 0]
            vectors.extend(torch.nn.functional.normalize(hidden.float(), p=2, dim=1).cpu().tolist())
    return {'object': 'list', 'model': MODEL,
            'data': [{'object':'embedding','index':i,'embedding':v} for i,v in enumerate(vectors)],
            'usage': {'prompt_tokens':tokens,'total_tokens':tokens}}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8082, access_log=False)

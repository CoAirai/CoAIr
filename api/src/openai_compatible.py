"""Private vLLM transport; retries, caching and accounting live in llm_client."""
from __future__ import annotations

import re
from urllib.parse import urlsplit

import httpx
from openai import OpenAI


class ContextLimitError(ValueError):
    pass


def validate_endpoint(base_url: str, api_key: str) -> None:
    url = urlsplit(base_url)
    if (url.scheme not in ("http", "https") or not url.hostname
            or url.username or url.password or url.query or url.fragment
            or url.path.rstrip("/") != "/v1"):
        raise ValueError("LLM_BASE_URL must be an HTTP(S) endpoint ending in /v1, without credentials")
    if not api_key or api_key.startswith("<"):
        raise ValueError("LLM_API_KEY must be configured server-side")


def visible_text(content: str | None) -> str:
    # The qwen3 server parser normally separates reasoning. Defend against a
    # misconfigured parser too, including an unfinished reasoning block.
    text = content or ""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[1]
    if "<think>" in text:
        text = text.split("<think>", 1)[0]
    return text.strip()


def generate(*, base_url: str, api_key: str, model: str, prompt: str,
             system: str, max_tokens: int, max_input_tokens: int,
             context_tokens: int, temperature: float, timeout_seconds: int,
             thinking: bool = False, json_mode: bool = False,
             response_schema: dict | None = None):
    validate_endpoint(base_url, api_key)
    messages = ([{"role": "system", "content": system}] if system else [])
    messages.append({"role": "user", "content": prompt})
    template = {"enable_thinking": thinking}
    # Count the actual chat template with the server's tokenizer. Character
    # estimates are not safe for Turkish, JSON, or large evidence bundles.
    with httpx.Client(timeout=timeout_seconds, follow_redirects=False) as http:
        tokens = http.post(
            base_url.rstrip("/").removesuffix("/v1") + "/tokenize",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "messages": messages,
                  "add_generation_prompt": True, "chat_template_kwargs": template},
        )
        tokens.raise_for_status()
        count = int(tokens.json()["count"])
    if count > max_input_tokens or count + max_tokens > context_tokens:
        raise ContextLimitError(
            f"input_budget_exceeded: {count} input + {max_tokens} output; "
            f"context={context_tokens}, task_input={max_input_tokens}"
        )
    kwargs = {}
    if response_schema is not None:
        kwargs["response_format"] = {"type": "json_schema", "json_schema": {
            "name": "result", "schema": response_schema}}
    elif json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    with OpenAI(base_url=base_url, api_key=api_key, timeout=timeout_seconds,
                max_retries=0) as client:
        response = client.chat.completions.create(
            model=model, messages=messages, max_tokens=max_tokens,
            temperature=temperature, extra_body={"chat_template_kwargs": template},
            **kwargs,
        )
    return response

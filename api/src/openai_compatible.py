"""Private vLLM transport; retries, caching and accounting live in llm_client."""
from __future__ import annotations

import re
import ipaddress
from urllib.parse import urlsplit

import httpx
from openai import OpenAI, APIStatusError


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
    try:
        address = ipaddress.ip_address(url.hostname)
        permitted = address.is_loopback or any(address in ipaddress.ip_network(net)
            for net in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "fc00::/7")
            if address.version == ipaddress.ip_network(net).version)
    except ValueError:
        permitted = bool(re.fullmatch(r"[a-zA-Z0-9_-]+", url.hostname)) or url.hostname.endswith((".local", ".internal"))
    if not permitted:
        raise ValueError("Local inference requires a private endpoint; public cloud endpoints are forbidden")



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


def tokenize(base_url, api_key, model, messages, timeout_seconds, thinking=False):
    validate_endpoint(base_url, api_key)
    with httpx.Client(timeout=timeout_seconds, follow_redirects=False, trust_env=False) as http:
        response = http.post(base_url.rstrip("/").removesuffix("/v1") + "/tokenize",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "messages": messages, "add_generation_prompt": True,
                  "chat_template_kwargs": {"enable_thinking": thinking}})
        response.raise_for_status()
        return int(response.json()["count"])


class PublicTextFilter:
    """Keep split reasoning tags and their bodies out of public streams."""
    def __init__(self):
        self.pending = ""
        self.inside = False

    def feed(self, text, final=False):
        self.pending += text
        output = ""
        while self.pending:
            tag = "</think>" if self.inside else "<think>"
            index = self.pending.find(tag)
            if index >= 0:
                if not self.inside:
                    output += self.pending[:index]
                self.pending = self.pending[index + len(tag):]
                self.inside = not self.inside
                continue
            if self.inside:
                self.pending = self.pending[-(len(tag)-1):]
                break
            keep = 0
            if not final:
                for size in range(1, min(len(tag), len(self.pending)+1)):
                    if self.pending.endswith(tag[:size]):
                        keep = size
            if keep:
                output += self.pending[:-keep]
                self.pending = self.pending[-keep:]
            else:
                output += self.pending
                self.pending = ""
            break
        return output


def generate(*, base_url: str, api_key: str, model: str, prompt: str,
             system: str, max_tokens: int, max_input_tokens: int,
             context_tokens: int, temperature: float, timeout_seconds: int,
             thinking: bool = False, json_mode: bool = False,
             response_schema: dict | None = None):
    validate_endpoint(base_url, api_key)
    messages = ([{"role": "system", "content": system}] if system else [])
    messages.append({"role": "user", "content": prompt})
    template = {"enable_thinking": thinking}
    count = tokenize(base_url, api_key, model, messages, timeout_seconds, thinking)
    if count > max_input_tokens or count + max_tokens > context_tokens:
        raise ContextLimitError(f"input_budget_exceeded: {count} input + {max_tokens} output; context={context_tokens}")
    kwargs = {}
    if response_schema is not None:
        kwargs["response_format"] = {"type": "json_schema", "json_schema": {
            "name": "result", "schema": response_schema}}
    elif json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    from backend.core.security import get_current_username
    from .user_store import get_user_store
    from .appliance_quota import reserve, settle
    username = get_current_username()
    store = get_user_store() if username else None
    reservation = reserve(store, username, count + max_tokens) if store else None
    actual = None
    try:
        from .answer_stream import answer_stream_var, publish_answer
        with OpenAI(base_url=base_url, api_key=api_key, timeout=timeout_seconds,
                    max_retries=0, http_client=httpx.Client(trust_env=False)) as client:
            arguments = dict(model=model, messages=messages, max_tokens=max_tokens,
                             temperature=temperature,
                             extra_body={"chat_template_kwargs": template}, **kwargs)
            if answer_stream_var.get() and not (json_mode or response_schema):
                from types import SimpleNamespace
                chunks = []
                usage = None
                finish = "stream_incomplete"
                filter_text = PublicTextFilter()
                for chunk in client.chat.completions.create(
                    **arguments, stream=True, stream_options={"include_usage": True},
                ):
                    if chunk.usage:
                        usage = chunk.usage
                    for choice in chunk.choices:
                        if choice.finish_reason:
                            finish = choice.finish_reason
                        # reasoning_content/thought channels are intentionally ignored.
                        delta = filter_text.feed(choice.delta.content or "")
                        if delta:
                            chunks.append(delta)
                            publish_answer("answer_delta", text=delta)
                tail = filter_text.feed("", final=True)
                if tail:
                    chunks.append(tail); publish_answer("answer_delta", text=tail)
                if filter_text.inside:
                    finish = "stream_incomplete"
                response = SimpleNamespace(choices=[SimpleNamespace(
                    message=SimpleNamespace(content="".join(chunks)), finish_reason=finish)], usage=usage)
            else:
                response = client.chat.completions.create(**arguments)
        if response.usage:
            actual = response.usage.prompt_tokens + response.usage.completion_tokens
    except APIStatusError as exc:
        if 400 <= exc.status_code < 500:
            actual = 0  # Provider explicitly rejected the generation request.
        raise
    finally:
        if store:
            settle(store, reservation, actual)
    return response

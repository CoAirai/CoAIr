"""Request-local public answer deltas; never provider reasoning/thought tokens."""
from contextvars import ContextVar
from typing import Callable

answer_stream_var: ContextVar[Callable | None] = ContextVar("answer_stream", default=None)
answer_append_var: ContextVar[bool] = ContextVar("answer_append", default=False)


def publish_answer(event: str, **payload) -> None:
    callback = answer_stream_var.get()
    if callback:
        callback({"type": event, **payload})

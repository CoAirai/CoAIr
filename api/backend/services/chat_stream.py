"""SSE delivery around the existing authorized/persisted chat workflow."""
import asyncio
import json
from contextlib import suppress
from uuid import uuid4

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from src.answer_stream import answer_stream_var
from backend.tasks.query_progress import query_progress


def stream_chat(run):
    async def events():
        loop = asyncio.get_running_loop()
        queue = asyncio.Queue(maxsize=64)
        request_id = uuid4().hex
        connected = True
        import threading
        loop_thread = threading.get_ident()
        live_text = True

        def publish(event):
            nonlocal live_text
            if not connected or not live_text:
                return
            if threading.get_ident() == loop_thread:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    live_text = False
                return
            future = asyncio.run_coroutine_threadsafe(queue.put(event), loop)
            try:
                future.result(timeout=2)
            except Exception:
                future.cancel()
                live_text = False
                # Slow/disconnected clients can still retrieve the final saved
                # turn. Never accumulate an unbounded token queue in RAM.

        async def work():
            token = answer_stream_var.set(publish)
            try:
                response = await run(request_id)
                await queue.put({"type": "complete", "response": response.model_dump(mode="json")})
            except Exception as exc:
                status = exc.status_code if isinstance(exc, HTTPException) else 500
                detail = exc.detail if isinstance(exc, HTTPException) else "Unable to complete the answer."
                await queue.put({"type": "error", "status": status, "message": detail})
            finally:
                answer_stream_var.reset(token)

        task = asyncio.create_task(work())
        seq = 0
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=.5)
                except asyncio.TimeoutError:
                    event = {"type": "heartbeat"}
                activity = query_progress.get(request_id)
                if activity:
                    for step in list(activity.steps)[seq:]:
                        yield "data: " + json.dumps({"type": "activity", "kind": step.kind,
                            "label": step.label, "detail": step.detail}) + "\n\n"
                        seq += 1
                yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"
                if event["type"] in {"complete", "error"}:
                    break
        finally:
            connected = False
            # Do not cancel to_thread's running generation and lose accounting
            # or persisted history. Drain the bounded queue until it finishes.
            if not task.done():
                async def drain():
                    while not task.done():
                        with suppress(asyncio.TimeoutError):
                            await asyncio.wait_for(queue.get(), timeout=.5)
                    with suppress(Exception):
                        await task
                asyncio.create_task(drain())
    return StreamingResponse(events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
    })

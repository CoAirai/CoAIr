"""POST /api/chat — main chat endpoint."""

import asyncio
from fastapi import APIRouter, Depends, HTTPException

from backend.models.requests import AnswerDocumentRequest, AnswerSpreadsheetRequest, ChatRequest
from backend.models.responses import ChatResponse, QueryProgressResponse, QueryActivityStep
from backend.core.dependencies import get_query_router, get_conversation_store
from backend.core.security import UserContext, get_current_user
from backend.core.projects import ProjectContext, get_current_project
from backend.services.chat_orchestrator import ChatOrchestrator
from backend.tasks.query_progress import query_progress

router = APIRouter()
_orchestrator = ChatOrchestrator()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    user: UserContext = Depends(get_current_user),
    query_router=Depends(get_query_router),
    store=Depends(get_conversation_store),
    project: ProjectContext = Depends(get_current_project),
):
    # Feature gating — correspondence mode is a per-user flag.
    if req.mode == "correspondence" and not user.features.get("correspondence", False):
        raise HTTPException(403, "feature_not_available:correspondence")
    from src.appliance_admission import ChatLease
    from src.config import LOCAL_LLM
    async def execute():
        # Identity/project membership may have changed while this request waited.
        from src.user_store import get_user_store, account_expired
        from src.project_store import get_project_store
        from backend.core.security import set_current_user_context
        record = get_user_store().get_user(user.username) if LOCAL_LLM else None
        if LOCAL_LLM and (not record or not record['is_active'] or account_expired(record) or record.get('must_change_password')):
            raise HTTPException(403, 'account_access_unavailable')
        if LOCAL_LLM and record.get('access_plan'):
            from src.document_registry import get_document_registry
            registry = get_document_registry()
            for identifier in list(req.doc_ids or []) + list(req.email_ids or []):
                item = registry.get(identifier)
                if item is None or item.project_id != project.project_id:
                    raise HTTPException(404, 'selected_document_not_found')
        current_project = project
        if LOCAL_LLM:
            identity = set_current_user_context(user.username)
            if identity is None:
                raise HTTPException(403, 'account_access_unavailable')
            current_project = get_current_project(project.project_id, identity, get_project_store())
        return await _orchestrator.process(
            query=req.message,
            conversation_id=req.conversation_id,
            router=query_router,
            store=store,
            doc_ids=req.doc_ids,
            email_ids=req.email_ids,
            mode=req.mode,
            username=user.username,
            request_id=req.request_id,
            project_id=project.project_id,
            project_role=current_project.role,
        )
    if not LOCAL_LLM:
        return await execute()
    try:
        query_progress.start(req.request_id, user.username)
    except ValueError as exc:
        raise HTTPException(409, 'request_id_already_used') from exc
    query_progress.add(req.request_id, 'thinking', 'Waiting for an available generation slot')
    try:
        async with ChatLease(user.username):
            task = asyncio.create_task(execute())
            try:
                return await asyncio.shield(task)
            except asyncio.CancelledError:
                # Cancellation must not release capacity while the GPU worker runs.
                try:
                    await task
                finally:
                    raise
    finally:
        query_progress.finish(req.request_id)


@router.get("/chat/progress/{request_id}", response_model=QueryProgressResponse)
async def chat_progress(
    request_id: str,
    user: UserContext = Depends(get_current_user),
):
    """Live activity feed for an in-flight query. The client polls this with the
    same request_id it sent to POST /chat while the answer is being produced."""
    act = query_progress.get(request_id)
    if act is not None and act.username != user.username:
        raise HTTPException(404, 'request_not_found')
    if act is None:
        return QueryProgressResponse(request_id=request_id, steps=[], done=False)
    return QueryProgressResponse(
        request_id=request_id,
        steps=[QueryActivityStep(seq=s.seq, ts=s.ts, kind=s.kind, label=s.label, detail=s.detail)
               for s in act.steps],
        done=act.done,
    )


@router.post("/chat/document")
async def chat_answer_document(
    req: AnswerDocumentRequest,
    _: UserContext = Depends(get_current_user),
):
    """One answer as a Word document.

    The caller posts what it is holding rather than naming a stored message,
    because the server has strictly less of it: only the first 20 preview rows
    are persisted and the row total is not, so rendering from disk could not
    produce a better document — and an id-based route would not work at all for
    the conversations already written. Posting also makes the download behave the
    same for a fresh answer and a reopened one, which is the requirement.

    So this is a formatter: it reads no corpus, touches no filesystem, and echoes
    only what the caller already had. The caps in src/answer_docx are what keep
    that from becoming a way to make the box do arbitrary work, and rendering
    runs in a thread so a long answer cannot block the event loop.
    """
    import asyncio

    from src.answer_docx import answer_filename, build_answer_docx

    from ._docx import docx_response

    blob = await asyncio.to_thread(
        build_answer_docx,
        req.question,
        req.answer,
        citations=[c.model_dump() for c in req.citations],
        sql=req.sql,
        table_columns=req.table_columns,
        table_rows=req.table_rows,
        total_rows=req.total_rows,
    )
    return docx_response(blob, answer_filename(req.question))


@router.post("/chat/spreadsheet")
async def chat_answer_spreadsheet(
    req: AnswerSpreadsheetRequest,
    _: UserContext = Depends(get_current_user),
):
    """Echo supplied rows as XLSX. No project lookup or SQL execution occurs."""
    from fastapi.responses import Response
    from src.answer_xlsx import build_answer_xlsx
    try:
        blob = await asyncio.to_thread(build_answer_xlsx, req.table_columns, req.table_rows)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return Response(blob, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="coair-table.xlsx"'})

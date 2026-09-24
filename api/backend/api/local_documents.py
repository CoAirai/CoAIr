"""Local appliance inbox and editable extraction; all routes remain tenant gated."""
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from backend.core.security import UserContext, get_current_user
from backend.core.projects import ProjectContext, require_project_editor
from backend.services.file_service import FileService, EXTENSION_MAP
from backend.tasks.ingestion_jobs import get_ingestion_job_store
from src.config import DEPLOYMENT_MODE
from src.document_registry import get_document_registry
from src.document_review import ReviewStore, FIELDS


def local_only():
    if DEPLOYMENT_MODE != 'local':
        raise HTTPException(404, 'Not available')

router = APIRouter(dependencies=[Depends(local_only)])
INBOX = Path('/import')


def inbox_path(relative):
    root = INBOX.resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file() or path.suffix.lower() not in EXTENSION_MAP:
        raise HTTPException(400, 'invalid_inbox_path')
    if any(part.startswith('.') for part in Path(relative).parts):
        raise HTTPException(400, 'hidden_file')
    return path


def record_for(file_id, project):
    record = get_document_registry().get(file_id)
    if not record or record.project_id != project.project_id:
        raise HTTPException(404, 'document_not_found')
    return record


def require_inbox_owner(user, project):
    # The machine inbox is shared; only company/project owners may import it.
    if project.role != 'owner' and user.role not in ('admin', 'superadmin'):
        raise HTTPException(403, 'inbox_requires_project_owner')


@router.get('/local/inbox')
def list_inbox(user: UserContext = Depends(get_current_user),
               project: ProjectContext = Depends(require_project_editor)):
    require_inbox_owner(user, project)
    files = []
    if INBOX.exists():
        for path in sorted(INBOX.rglob('*')):
            if len(files) >= 5000:
                break
            relative = str(path.relative_to(INBOX))
            if path.is_file() and not path.is_symlink() and path.suffix.lower() in EXTENSION_MAP and not any(p.startswith('.') for p in Path(relative).parts):
                files.append({'path':relative, 'bytes':path.stat().st_size})
    return {'files':files}


class ImportRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=100)


@router.post('/local/import')
async def import_files(body: ImportRequest, user: UserContext = Depends(get_current_user),
                       project: ProjectContext = Depends(require_project_editor)):
    require_inbox_owner(user, project)
    sources = [inbox_path(path) for path in body.paths]
    results = []
    for source in sources:
        with source.open('rb') as stream:
            upload = UploadFile(file=stream, filename=source.name)
            path, file_id, duplicate = await FileService().save(upload, project.project_id, username=user.username)
        job = None if duplicate else get_ingestion_job_store().enqueue(
            project.project_id, file_id, path, source.name, requested_by=user.username)
        results.append({'file_id':file_id, 'filename':source.name,
                        'status':'ready' if duplicate else job['status']})
    return {'files':results}


@router.get('/local/documents/{file_id}/original')
def original(file_id: str, project: ProjectContext = Depends(require_project_editor)):
    record = record_for(file_id, project)
    return FileResponse(record.file_path, filename=record.file_name,
                        content_disposition_type='inline')


@router.get('/local/documents/{file_id}/review')
def get_review(file_id: str, project: ProjectContext = Depends(require_project_editor)):
    record_for(file_id, project)
    review = ReviewStore().get(project.project_id,file_id)
    if not review:
        raise HTTPException(409, 'extraction_not_ready_or_unsupported_file_type')
    # Older review baselines predate structured local metadata. Enrich only
    # missing fields; saved user revisions always take precedence.
    from src.config import STORAGE_DIR
    import json
    folder = Path(STORAGE_DIR) / 'document_metadata' / project.project_id / file_id
    snapshots = sorted(folder.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)
    if snapshots:
        extraction = json.loads(snapshots[0].read_text())
        review['extraction'] = extraction
        for key in FIELDS:
            if key not in review['metadata'] and key in extraction:
                value = extraction[key]
                review['metadata'][key] = '\n'.join(value) if isinstance(value, list) else value
    return review


class ReviewRequest(BaseModel):
    version: int = Field(ge=0)
    pages: dict[str,str]
    metadata: dict[str,str]


@router.put('/local/documents/{file_id}/review')
def save_review(file_id: str, body: ReviewRequest,
                user: UserContext = Depends(get_current_user),
                project: ProjectContext = Depends(require_project_editor)):
    record = record_for(file_id, project)
    if set(body.metadata) - set(FIELDS) or sum(map(len, body.pages.values())) > 5_000_000 or any(len(v)>4000 for v in body.metadata.values()):
        raise HTTPException(400, 'invalid_review')
    jobs = get_ingestion_job_store()
    # Hold the worker's claim lock until both the revision and its job are durable.
    with jobs._lock:
        job = jobs.get_by_file(file_id, project.project_id)
        if job and job['status'] in ('processing', 'queued'):
            raise HTTPException(409, 'wait_for_current_processing')
        try:
            result = ReviewStore().save(project.project_id,file_id,body.version,
                                        body.pages,body.metadata,user.username)
        except ValueError as exc:
            raise HTTPException(409,str(exc)) from exc
        if job:
            jobs.fail(job['job_id'], 'review_updated_reindex_required')
        jobs.enqueue(project.project_id,file_id,record.file_path,record.file_name,requested_by=user.username)
    return dict(result, status='queued')

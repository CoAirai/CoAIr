"""FastAPI project-scope dependencies and authorization helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException

from backend.core.security import UserContext, get_current_user, is_admin
from src.project_context import set_current_project
from src.project_store import ProjectStore, get_project_store


def server_embedding_profile() -> str:
    from src.config import EMBEDDING_PROVIDER
    return "gemini-embedding-2" if EMBEDDING_PROVIDER == "gemini" else "local-bge-v1"


@dataclass(frozen=True)
class ProjectContext:
    project_id: str
    name: str
    role: str
    embedding_profile: str
    # Which organization owns the project, and how the caller reached it:
    # "member" (explicit project_members row), "org" (company-wide reach as the
    # organization's owner) or "platform" (one of our operators).
    org_id: str = ""
    role_source: str = "member"


def get_current_project(
    x_project_id: Optional[str] = Header(default=None, alias="X-Project-ID"),
    user: UserContext = Depends(get_current_user),
    store: ProjectStore = Depends(get_project_store),
) -> ProjectContext:
    project_id = (x_project_id or "").strip()
    if not project_id:
        raise HTTPException(428, "project_required")

    # Platform operators reach everything; everyone else goes through the single
    # visibility query — explicit project membership, or company-wide reach as
    # the organization's owner. The org case is deliberately NOT folded into the
    # is_admin branch: that one skips membership entirely, so an org owner
    # entering through it would reach any project on the platform.
    record = (store.get(project_id) if is_admin(user.role)
              else store.get_visible(project_id, user.username))
    if not record or record.get("archived_at"):
        # Deliberately use 404 so project identifiers cannot be enumerated.
        raise HTTPException(404, "project_not_found")
    configured_profile = str(record.get("embedding_profile") or "local-bge-v1")
    if configured_profile != server_embedding_profile():
        raise HTTPException(409, {
            "error": "embedding_profile_unavailable",
            "project_profile": configured_profile,
            "server_profile": server_embedding_profile(),
        })
    role = "owner" if is_admin(user.role) else str(record.get("role") or "viewer")
    set_current_project(project_id, role)
    return ProjectContext(
        project_id=project_id,
        name=str(record.get("name") or ""),
        role=role,
        embedding_profile=configured_profile,
        org_id=str(record.get("org_id") or ""),
        role_source=("platform" if is_admin(user.role)
                     else str(record.get("role_source") or "member")),
    )


def require_project_editor(project: ProjectContext = Depends(get_current_project)) -> ProjectContext:
    if project.role not in ("owner", "editor"):
        raise HTTPException(403, "project_editor_required")
    return project


def require_project_owner(project: ProjectContext = Depends(get_current_project)) -> ProjectContext:
    if project.role != "owner":
        raise HTTPException(403, "project_owner_required")
    return project


__all__ = [
    "ProjectContext",
    "get_current_project",
    "require_project_editor",
    "require_project_owner",
    "server_embedding_profile",
]

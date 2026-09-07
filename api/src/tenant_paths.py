"""Company / project filesystem + S3 key layout.

Uploads land under::

    data/companies/{company-slug}/{project-slug}/{documents|emails|tables}/…

which syncs to S3 as::

    uploads/companies/{company-slug}/{project-slug}/{documents|emails|tables}/…

Legacy paths ``data/projects/{project_id}/…`` are still read for older files.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

from .config import DATA_DIR, DOCUMENTS_DIR, EMAILS_DIR, TABLES_DIR
from .project_store import _slug

_LEAF = {
    "document": "documents",
    "email": "emails",
    "data": "tables",
}

_UNASSIGNED = "_unassigned"
_PROJECT_MARKER = ".coair-project-id"


def file_type_leaf(file_type: str) -> str:
    return _LEAF.get(file_type, "documents")


def legacy_project_root(project_id: str) -> Path:
    return Path(DATA_DIR) / "projects" / (project_id or "").strip()


def legacy_project_type_dir(project_id: str, file_type: str) -> Path:
    return legacy_project_root(project_id) / file_type_leaf(file_type)


def resolve_company_project_slugs(project_id: str) -> Tuple[str, str]:
    """Return ``(company_slug, project_slug)`` for a project id.

    Uses org/project display slugs when available so S3 folders match company
    and project names (e.g. ``ahmad/tower-a``). Falls back to ``_unassigned``
    / project id when org linkage is missing.
    """
    clean_id = (project_id or "").strip()
    if not clean_id:
        return _UNASSIGNED, "unknown"

    company_slug = _UNASSIGNED
    project_slug = _slug(clean_id)

    try:
        from .project_store import get_project_store

        project = get_project_store().get(clean_id) or {}
    except Exception:
        project = {}

    if not project:
        return company_slug, project_slug

    project_slug = _slug(str(project.get("slug") or project.get("name") or clean_id))
    org_id = (project.get("org_id") or "").strip()
    if org_id:
        try:
            from .org_store import get_org_store

            org = get_org_store().get_org(org_id) or {}
        except Exception:
            org = {}
        company_slug = _slug(str(org.get("slug") or org.get("name") or org_id)) or _slug(
            org_id
        )

    # If another project already owns this name folder, disambiguate.
    candidate = Path(DATA_DIR) / "companies" / company_slug / project_slug
    marker = candidate / _PROJECT_MARKER
    if candidate.exists() and marker.is_file():
        try:
            owner = marker.read_text(encoding="utf-8").strip()
        except Exception:
            owner = ""
        if owner and owner != clean_id:
            project_slug = f"{project_slug}-{clean_id[:8]}"

    return company_slug, project_slug


def company_project_root(project_id: str) -> Path:
    company, project = resolve_company_project_slugs(project_id)
    return Path(DATA_DIR) / "companies" / company / project


def ensure_project_root(project_id: str) -> Path:
    """Create the company/project folder and stamp ownership for slug collisions."""
    root = company_project_root(project_id)
    root.mkdir(parents=True, exist_ok=True)
    marker = root / _PROJECT_MARKER
    if not marker.exists():
        try:
            marker.write_text((project_id or "").strip(), encoding="utf-8")
        except Exception:
            pass
    return root


def project_type_dir(project_id: str, file_type: str) -> Path:
    """Canonical write path for a project-scoped upload."""
    if not (project_id or "").strip():
        return Path(
            {
                "document": DOCUMENTS_DIR,
                "email": EMAILS_DIR,
                "data": TABLES_DIR,
            }.get(file_type, DOCUMENTS_DIR)
        )
    return ensure_project_root(project_id) / file_type_leaf(file_type)


def project_type_dirs_for_read(project_id: str, file_type: str) -> List[Path]:
    """Write path first, then legacy — used for delete / discovery fallbacks."""
    if not (project_id or "").strip():
        return [
            Path(
                {
                    "document": DOCUMENTS_DIR,
                    "email": EMAILS_DIR,
                    "data": TABLES_DIR,
                }.get(file_type, DOCUMENTS_DIR)
            )
        ]
    modern = company_project_root(project_id) / file_type_leaf(file_type)
    legacy = legacy_project_type_dir(project_id, file_type)
    if modern.resolve() == legacy.resolve():
        return [modern]
    return [modern, legacy]


def s3_upload_key_for_local(file_path: str) -> Optional[str]:
    """Map a local DATA_DIR file to the ``uploads/…`` object key."""
    p = Path(file_path)
    try:
        rel = p.resolve().relative_to(Path(DATA_DIR).resolve())
    except ValueError:
        try:
            rel = p.relative_to(DATA_DIR)
        except ValueError:
            return None
    return f"uploads/{rel.as_posix()}"

"""SQLite-backed projects and project memberships.

Projects are the security boundary for every document, conversation, report,
query run and derived index record.  This store deliberately keeps membership
checks in one place so route handlers cannot improvise their own visibility
rules.
"""

from __future__ import annotations

import re
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from .config import QDRANT_COLLECTION, STORAGE_DIR
from .database import DbRow, connect, table_columns, use_postgres


PROJECTS_DB = Path(STORAGE_DIR) / "projects.db"
PROJECT_ROLES = ("owner", "editor", "viewer")
ORG_ROLES = ("owner", "member")
VECTOR_STATUSES = (
    "empty", "provisioning", "provisioned", "indexing", "ready", "error", "archived",
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    project_id          TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    slug                TEXT NOT NULL,
    embedding_profile   TEXT NOT NULL DEFAULT 'local-bge-v1',
    created_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    archived_at         TEXT
);
CREATE TABLE IF NOT EXISTS project_members (
    project_id  TEXT NOT NULL,
    username    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
    created_at  TEXT NOT NULL,
    PRIMARY KEY(project_id, username),
    FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_members_user
    ON project_members(username, project_id);
CREATE TABLE IF NOT EXISTS project_vector_state (
    project_id          TEXT PRIMARY KEY,
    embedding_profile   TEXT NOT NULL,
    collection_name     TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'empty',
    point_count         INTEGER NOT NULL DEFAULT 0,
    last_error          TEXT,
    provisioned_at      TEXT,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS organizations (
    org_id                  TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    slug                    TEXT NOT NULL UNIQUE,
    default_plan_type       TEXT NOT NULL DEFAULT 'demo'
                            CHECK(default_plan_type IN ('demo','legacy')),
    default_credits         REAL NOT NULL DEFAULT 0,
    default_token_limit     INTEGER NOT NULL DEFAULT 1000000,
    default_storage_bytes   INTEGER NOT NULL DEFAULT 30000000000,
    project_limit           INTEGER NOT NULL DEFAULT 0,
    allow_member_projects   INTEGER NOT NULL DEFAULT 0,
    created_by              TEXT NOT NULL,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    archived_at             TEXT
);
CREATE TABLE IF NOT EXISTS org_members (
    org_id      TEXT NOT NULL,
    username    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('owner','member')),
    created_at  TEXT NOT NULL,
    PRIMARY KEY(org_id, username),
    FOREIGN KEY(org_id) REFERENCES organizations(org_id) ON DELETE CASCADE
);
-- One org per user is an enforced invariant, not a convention: every
-- resolution path assumes at most one row per username. Dropping this index is
-- the whole migration to multi-org membership later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_username
    ON org_members(username);
"""

# Columns added after the first release. `CREATE TABLE IF NOT EXISTS` does
# nothing to a table that already exists, so a new column has to be applied
# with ALTER — otherwise every query against it fails on a deployed database.
_MIGRATIONS = (
    ("projects", "org_id", "ALTER TABLE projects ADD COLUMN org_id TEXT"),
)


def ensure_schema(conn) -> None:
    """Create and migrate every table in projects.db."""
    if use_postgres():
        return
    conn.executescript(_SCHEMA)
    for table, column, statement in _MIGRATIONS:
        columns = table_columns(conn, table)
        if column not in columns:
            conn.execute(statement)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id, archived_at)"
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug[:64] or "project"


class ProjectStore:
    _instance: Optional["ProjectStore"] = None
    _instance_lock = threading.Lock()

    def __init__(self, db_path: Path = PROJECTS_DB):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.RLock()
        if not use_postgres():
            with self._connect() as conn:
                ensure_schema(conn)

    @classmethod
    def instance(cls) -> "ProjectStore":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @contextmanager
    def _connect(self):
        with connect(self.db_path) as conn:
            yield conn

    @staticmethod
    def _row(row: DbRow, role: str = "", role_source: str = "member") -> Dict[str, Any]:
        keys = row.keys()
        return {
            "project_id": row["project_id"],
            "name": row["name"],
            "slug": row["slug"],
            "embedding_profile": row["embedding_profile"],
            "created_by": row["created_by"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "archived_at": row["archived_at"],
            # Present only after the org migration; tolerate a stale row factory.
            "org_id": row["org_id"] if "org_id" in keys else None,
            "role": role,
            # How the caller reached this project: an explicit project_members
            # row, or company-wide reach as the organization's owner.
            "role_source": role_source,
        }

    def create_project(
        self,
        name: str,
        owner: str,
        *,
        embedding_profile: str = "local-bge-v1",
        org_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        clean_name = (name or "").strip()
        if not clean_name:
            raise ValueError("project name is required")
        if embedding_profile not in ("local-bge-v1", "gemini-embedding-2"):
            raise ValueError("unsupported embedding profile")
        project_id = uuid.uuid4().hex[:16]
        now = _now()
        with self._write_lock, self._connect() as conn:
            # Named columns, not positional: this table gains columns over time
            # and a positional insert breaks (or silently misaligns) when it does.
            conn.execute(
                "INSERT INTO projects (project_id,name,slug,embedding_profile,"
                "created_by,created_at,updated_at,archived_at,org_id) "
                "VALUES (?,?,?,?,?,?,?,NULL,?)",
                [project_id, clean_name[:160], _slug(clean_name), embedding_profile,
                 owner, now, now, (org_id or None)],
            )
            conn.execute(
                "INSERT INTO project_members (project_id,username,role,created_at) "
                "VALUES (?,?,?,?)",
                [project_id, owner, "owner", now],
            )
            conn.execute(
                "INSERT INTO project_vector_state "
                "(project_id,embedding_profile,collection_name,status,point_count,updated_at) "
                "VALUES (?,?,?,'empty',0,?)",
                [project_id, embedding_profile, QDRANT_COLLECTION, now],
            )
        return self.get_for_user(project_id, owner) or {}

    def get_vector_state(self, project_id: str) -> Dict[str, Any]:
        """Return the durable vector lifecycle for a project.

        Existing projects predate this table, so the row is created lazily from
        the immutable embedding profile.  Collection names are operational
        metadata and are deliberately omitted by the API layer.
        """
        with self._write_lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM project_vector_state WHERE project_id=?", [project_id]
            ).fetchone()
            if row is None:
                project = conn.execute(
                    "SELECT embedding_profile,archived_at FROM projects WHERE project_id=?",
                    [project_id],
                ).fetchone()
                if project is None:
                    return {}
                status = "archived" if project["archived_at"] else "empty"
                now = _now()
                conn.execute(
                    "INSERT INTO project_vector_state "
                    "(project_id,embedding_profile,collection_name,status,point_count,updated_at) "
                    "VALUES (?,?,?,?,0,?)",
                    [project_id, project["embedding_profile"], QDRANT_COLLECTION, status, now],
                )
                row = conn.execute(
                    "SELECT * FROM project_vector_state WHERE project_id=?", [project_id]
                ).fetchone()
        return dict(row) if row else {}

    def set_vector_state(
        self,
        project_id: str,
        status: str,
        *,
        point_count: Optional[int] = None,
        last_error: Optional[str] = None,
    ) -> Dict[str, Any]:
        if status not in VECTOR_STATUSES:
            raise ValueError("invalid vector status")
        self.get_vector_state(project_id)
        now = _now()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE project_vector_state SET status=?, "
                "point_count=COALESCE(?,point_count), last_error=?, "
                "provisioned_at=CASE "
                "WHEN ? IN ('provisioned','indexing','ready') "
                "THEN COALESCE(provisioned_at,?) ELSE provisioned_at END, "
                "updated_at=? WHERE project_id=?",
                [status, point_count, (last_error or None), status, now, now, project_id],
            )
        return self.get_vector_state(project_id)

    def list_for_user(self, username: str, *, include_archived: bool = False) -> List[Dict[str, Any]]:
        sql = (
            "SELECT p.*, m.role FROM projects p JOIN project_members m "
            "ON m.project_id=p.project_id WHERE m.username=?"
        )
        params: List[Any] = [username]
        if not include_archived:
            sql += " AND p.archived_at IS NULL"
        sql += " ORDER BY p.updated_at DESC, p.name"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row(r, r["role"]) for r in rows]

    def list_all(self, *, include_archived: bool = False) -> List[Dict[str, Any]]:
        sql = "SELECT p.*, 'admin' AS role FROM projects p"
        if not include_archived:
            sql += " WHERE p.archived_at IS NULL"
        sql += " ORDER BY p.updated_at DESC, p.name"
        with self._connect() as conn:
            rows = conn.execute(sql).fetchall()
        return [self._row(r, "admin", "platform") for r in rows]

    # ── Visibility: membership OR company-wide reach ────────
    #
    # `get_for_user` / `list_for_user` above stay pure membership primitives.
    # The two methods below are what route handlers ask, and they are the only
    # place that decides whether a user may select a project.
    #
    # `p.org_id IS NOT NULL` is the fail-closed clause: a project belonging to
    # no organization is invisible to every org owner, so an unmigrated or
    # half-assigned row surfaces as a support ticket, never as a breach.

    _VISIBILITY_SELECT = (
        "SELECT p.*, COALESCE(m.role,'owner') AS role, "
        "       CASE WHEN m.username IS NOT NULL THEN 'member' ELSE 'org' END AS role_source "
        "FROM projects p "
        "LEFT JOIN project_members m ON m.project_id=p.project_id AND m.username=? "
        "LEFT JOIN org_members om ON om.username=? AND om.role='owner' "
        "                        AND om.org_id=p.org_id "
        "WHERE (m.username IS NOT NULL OR (om.org_id IS NOT NULL AND p.org_id IS NOT NULL))"
    )

    def get_visible(self, project_id: str, username: str) -> Optional[Dict[str, Any]]:
        """The project as this user may see it, or None."""
        with self._connect() as conn:
            row = conn.execute(
                f"{self._VISIBILITY_SELECT} AND p.project_id=?",
                [username, username, project_id],
            ).fetchone()
        return self._row(row, row["role"], row["role_source"]) if row else None

    def list_visible(self, username: str, *, include_archived: bool = False) -> List[Dict[str, Any]]:
        sql = self._VISIBILITY_SELECT
        if not include_archived:
            sql += " AND p.archived_at IS NULL"
        sql += " ORDER BY p.updated_at DESC, p.name"
        with self._connect() as conn:
            rows = conn.execute(sql, [username, username]).fetchall()
        return [self._row(r, r["role"], r["role_source"]) for r in rows]

    def list_for_org(self, org_id: str, *, include_archived: bool = False) -> List[Dict[str, Any]]:
        """Every project of one organization, with its member count."""
        if not org_id:
            return []
        sql = (
            "SELECT p.*, 'owner' AS role, "
            "(SELECT COUNT(*) FROM project_members pm WHERE pm.project_id=p.project_id) "
            "  AS member_count "
            "FROM projects p WHERE p.org_id=?"
        )
        if not include_archived:
            sql += " AND p.archived_at IS NULL"
        sql += " ORDER BY p.updated_at DESC, p.name"
        with self._connect() as conn:
            rows = conn.execute(sql, [org_id]).fetchall()
        return [{**self._row(r, "owner", "org"), "member_count": r["member_count"]}
                for r in rows]

    def get_for_org(self, project_id: str, org_id: str) -> Optional[Dict[str, Any]]:
        """Ownership assertion: this project belongs to this organization."""
        if not org_id:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM projects WHERE project_id=? AND org_id=?",
                [project_id, org_id],
            ).fetchone()
        return self._row(row, "owner", "org") if row else None

    def count_for_org(self, org_id: str, *, include_archived: bool = False) -> int:
        sql = "SELECT COUNT(*) FROM projects WHERE org_id=?"
        if not include_archived:
            sql += " AND archived_at IS NULL"
        with self._connect() as conn:
            return int(conn.execute(sql, [org_id]).fetchone()[0])

    def set_org(self, project_id: str, org_id: Optional[str], *, force: bool = False) -> Optional[Dict[str, Any]]:
        """Assign a project to an organization (platform action / migration).

        Refuses to move a project that already belongs to a different org unless
        forced: reassignment retroactively hands one company's documents to
        another company's owner.
        """
        current = self.get(project_id)
        if not current:
            return None
        existing = current.get("org_id")
        if existing and org_id and existing != org_id and not force:
            raise ValueError("project already belongs to another organization")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE projects SET org_id=?, updated_at=? WHERE project_id=?",
                [(org_id or None), _now(), project_id],
            )
        return self.get(project_id)

    def get_for_user(self, project_id: str, username: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT p.*, m.role FROM projects p JOIN project_members m "
                "ON m.project_id=p.project_id WHERE p.project_id=? AND m.username=?",
                [project_id, username],
            ).fetchone()
        return self._row(row, row["role"]) if row else None

    def get(self, project_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM projects WHERE project_id=?", [project_id]).fetchone()
        return self._row(row) if row else None

    def add_member(self, project_id: str, username: str, role: str) -> None:
        """Grant (or change) a user's access to a project.

        The cross-org check lives here rather than in the route because this is
        the single write path: without it, any project owner could add a user
        from another company and hand them the whole project.
        """
        if role not in PROJECT_ROLES:
            raise ValueError("invalid project role")
        with self._write_lock, self._connect() as conn:
            project_org = conn.execute(
                "SELECT org_id FROM projects WHERE project_id=?", [project_id],
            ).fetchone()
            if project_org is None:
                raise ValueError("project not found")
            project_org_id = project_org["org_id"]
            member_org = conn.execute(
                "SELECT org_id FROM org_members WHERE username=?", [username],
            ).fetchone()
            member_org_id = member_org["org_id"] if member_org else None
            if project_org_id or member_org_id:
                # Once either side is affiliated, both must be, to the same org.
                if project_org_id != member_org_id:
                    raise ValueError("cross_org_membership")
            conn.execute(
                "INSERT INTO project_members (project_id,username,role,created_at) "
                "VALUES (?,?,?,?) "
                "ON CONFLICT(project_id,username) DO UPDATE SET role=excluded.role",
                [project_id, username, role, _now()],
            )

    def list_members(self, project_id: str) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT username, role, created_at FROM project_members "
                "WHERE project_id=? ORDER BY role, username",
                [project_id],
            ).fetchall()
        return [dict(r) for r in rows]

    def remove_member(self, project_id: str, username: str) -> bool:
        """Revoke access. Refuses to remove the last owner — a project with no
        owner can never be renamed, shared or archived again."""
        with self._write_lock, self._connect() as conn:
            row = conn.execute(
                "SELECT role FROM project_members WHERE project_id=? AND username=?",
                [project_id, username],
            ).fetchone()
            if row is None:
                return False
            if row["role"] == "owner":
                owners = conn.execute(
                    "SELECT COUNT(*) FROM project_members "
                    "WHERE project_id=? AND role='owner'", [project_id],
                ).fetchone()[0]
                if int(owners) <= 1:
                    raise ValueError("last_project_owner")
            cur = conn.execute(
                "DELETE FROM project_members WHERE project_id=? AND username=?",
                [project_id, username],
            )
        return cur.rowcount > 0

    def archive(self, project_id: str) -> bool:
        now = _now()
        with self._write_lock, self._connect() as conn:
            cur = conn.execute(
                "UPDATE projects SET archived_at=?, updated_at=? "
                "WHERE project_id=? AND archived_at IS NULL",
                [now, now, project_id],
            )
        archived = cur.rowcount > 0
        if archived:
            self.set_vector_state(project_id, "archived")
        return archived

    def rename(self, project_id: str, name: str) -> Optional[Dict[str, Any]]:
        clean = (name or "").strip()
        if not clean:
            raise ValueError("project name is required")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE projects SET name=?, slug=?, updated_at=? WHERE project_id=?",
                [clean[:160], _slug(clean), _now(), project_id],
            )
        return self.get(project_id)


def get_project_store() -> ProjectStore:
    return ProjectStore.instance()


__all__ = [
    "PROJECT_ROLES", "VECTOR_STATUSES", "ProjectStore", "get_project_store",
]

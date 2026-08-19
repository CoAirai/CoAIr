"""SQLite-backed organizations and organization membership.

An organization is a customer company. Its `owner` is the company's SuperAdmin:
it reaches every project the company owns, creates the company's user accounts,
and grants those users access to individual projects. A `member` reaches only
the projects it was explicitly granted.

This is an authorization layer, not a second data boundary. Documents, vectors,
tables, conversations and jobs stay scoped by `project_id` exactly as before —
the organization only decides *which projects a user may select*. Keeping it
that way is why no worker, ContextVar or vector filter had to learn about it.

Lives in the same database file as projects so the visibility query
(`ProjectStore.get_visible`) stays a single statement on a single connection —
it runs on every content request.
"""

from __future__ import annotations

import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence

from .database import DbIntegrityError, DbRow, connect, use_postgres
from .logger import logger
from .project_store import ORG_ROLES, PROJECTS_DB, _now, _slug, ensure_schema


_ORG_UPDATABLE = (
    "name", "default_plan_type", "default_credits", "default_token_limit",
    "default_storage_bytes", "project_limit", "allow_member_projects",
)


class OrgStore:
    """Thread-safe singleton over the organizations tables."""

    _instance: Optional["OrgStore"] = None
    _instance_lock = threading.Lock()

    def __init__(self, db_path: Path = PROJECTS_DB):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.RLock()
        if not use_postgres():
            with self._connect() as conn:
                ensure_schema(conn)

    @classmethod
    def instance(cls) -> "OrgStore":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @contextmanager
    def _connect(self):
        with connect(self.db_path) as conn:
            yield conn

    @staticmethod
    def _row(row: DbRow) -> Dict[str, Any]:
        return {
            "org_id": row["org_id"],
            "name": row["name"],
            "slug": row["slug"],
            "default_plan_type": row["default_plan_type"],
            "default_credits": float(row["default_credits"]),
            "default_token_limit": int(row["default_token_limit"]),
            "default_storage_bytes": int(row["default_storage_bytes"]),
            "project_limit": int(row["project_limit"]),
            "allow_member_projects": bool(row["allow_member_projects"]),
            "created_by": row["created_by"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "archived_at": row["archived_at"],
        }

    # ── Organizations ───────────────────────────────────────

    def create_org(
        self,
        name: str,
        *,
        created_by: str,
        owner: str = "",
        default_plan_type: str = "demo",
        default_credits: float = 0,
        default_token_limit: int = 1_000_000,
        default_storage_bytes: int | None = None,
        project_limit: int = 0,
        allow_member_projects: bool = False,
    ) -> Dict[str, Any]:
        clean = (name or "").strip()
        if not clean:
            raise ValueError("organization name is required")
        if default_plan_type not in ("demo", "legacy"):
            raise ValueError("unsupported plan type")
        if default_storage_bytes is None:
            from src.commerce_store import plan_org_defaults
            default_storage_bytes = (
                plan_org_defaults("demo")["default_storage_bytes"]
                if default_plan_type == "demo"
                else 0
            )
        org_id = uuid.uuid4().hex[:16]
        now = _now()
        with self._write_lock, self._connect() as conn:
            try:
                conn.execute(
                    "INSERT INTO organizations (org_id,name,slug,default_plan_type,"
                    "default_credits,default_token_limit,default_storage_bytes,"
                    "project_limit,allow_member_projects,created_by,created_at,"
                    "updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)",
                    [org_id, clean[:160], _slug(clean), default_plan_type,
                     float(default_credits), int(default_token_limit),
                     int(default_storage_bytes), int(project_limit),
                     1 if allow_member_projects else 0, created_by, now, now],
                )
            except DbIntegrityError as exc:
                raise ValueError(f"organization already exists: {clean}") from exc
            if owner:
                try:
                    conn.execute(
                        "INSERT INTO org_members (org_id,username,role,created_at) "
                        "VALUES (?,?,?,?)",
                        [org_id, owner, "owner", now],
                    )
                except DbIntegrityError as exc:
                    raise ValueError("user already belongs to an organization") from exc
        logger.info(f"[OrgStore] Created organization {clean} ({org_id}) owner={owner or '-'}")
        return self.get_org(org_id) or {}

    def get_org(self, org_id: str) -> Optional[Dict[str, Any]]:
        if not org_id:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM organizations WHERE org_id=?", [org_id],
            ).fetchone()
        return self._row(row) if row else None

    def get_org_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM organizations WHERE slug=?", [(slug or "").strip()],
            ).fetchone()
        return self._row(row) if row else None

    def list_orgs(self, *, include_archived: bool = False) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM organizations"
        if not include_archived:
            sql += " WHERE archived_at IS NULL"
        sql += " ORDER BY name"
        with self._connect() as conn:
            return [self._row(r) for r in conn.execute(sql).fetchall()]

    def update_org(self, org_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
        invalid = set(fields) - set(_ORG_UPDATABLE)
        if invalid:
            raise ValueError(f"cannot update fields: {invalid}")
        if "default_plan_type" in fields and fields["default_plan_type"] not in ("demo", "legacy"):
            raise ValueError("unsupported plan type")
        sets: List[str] = []
        params: List[Any] = []
        for key, value in fields.items():
            if key == "name":
                clean = (value or "").strip()
                if not clean:
                    raise ValueError("organization name is required")
                sets.extend(["name = ?", "slug = ?"])
                params.extend([clean[:160], _slug(clean)])
            elif key == "allow_member_projects":
                sets.append("allow_member_projects = ?")
                params.append(1 if value else 0)
            else:
                sets.append(f"{key} = ?")
                params.append(value)
        if not sets:
            return self.get_org(org_id)
        sets.append("updated_at = ?")
        params.extend([_now(), org_id])
        with self._write_lock, self._connect() as conn:
            cur = conn.execute(
                f"UPDATE organizations SET {', '.join(sets)} WHERE org_id=?", params,
            )
            if cur.rowcount == 0:
                return None
        return self.get_org(org_id)

    def archive_org(self, org_id: str) -> bool:
        now = _now()
        with self._write_lock, self._connect() as conn:
            cur = conn.execute(
                "UPDATE organizations SET archived_at=?, updated_at=? "
                "WHERE org_id=? AND archived_at IS NULL",
                [now, now, org_id],
            )
        return cur.rowcount > 0

    def unarchive_org(self, org_id: str) -> bool:
        now = _now()
        with self._write_lock, self._connect() as conn:
            cur = conn.execute(
                "UPDATE organizations SET archived_at=NULL, updated_at=? "
                "WHERE org_id=? AND archived_at IS NOT NULL",
                [now, org_id],
            )
        return cur.rowcount > 0

    # ── Membership ──────────────────────────────────────────

    def add_member(self, org_id: str, username: str, role: str = "member") -> None:
        """Add a user to an organization, or change their role in it.

        A user belongs to exactly one organization; adding one that is already
        placed elsewhere raises rather than silently moving them, because the
        move would change what they can see.
        """
        if role not in ORG_ROLES:
            raise ValueError("invalid organization role")
        if not self.get_org(org_id):
            raise ValueError("organization not found")
        with self._write_lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT org_id FROM org_members WHERE username=?", [username],
            ).fetchone()
            if existing and existing["org_id"] != org_id:
                raise ValueError("user already belongs to an organization")
            conn.execute(
                "INSERT INTO org_members (org_id,username,role,created_at) "
                "VALUES (?,?,?,?) "
                "ON CONFLICT(org_id,username) DO UPDATE SET role=excluded.role",
                [org_id, username, role, _now()],
            )

    def remove_member(self, org_id: str, username: str) -> bool:
        with self._write_lock, self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM org_members WHERE org_id=? AND username=?",
                [org_id, username],
            )
        return cur.rowcount > 0

    def list_members(self, org_id: str) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT username, role, created_at FROM org_members "
                "WHERE org_id=? ORDER BY role, username",
                [org_id],
            ).fetchall()
        return [dict(r) for r in rows]

    def list_usernames(self, org_id: str) -> List[str]:
        return [m["username"] for m in self.list_members(org_id)]

    def count_owners(self, org_id: str) -> int:
        with self._connect() as conn:
            return int(conn.execute(
                "SELECT COUNT(*) FROM org_members WHERE org_id=? AND role='owner'",
                [org_id],
            ).fetchone()[0])

    def is_owner(self, org_id: str, username: str) -> bool:
        membership = self.membership_for(username)
        return bool(membership and membership["org_id"] == org_id
                    and membership["role"] == "owner")

    # ── Request-path lookup ─────────────────────────────────

    def membership_for(self, username: str) -> Optional[Dict[str, Any]]:
        """This user's organization and role in it, or None.

        `None` for platform operators and for every account that predates
        organizations — which is what makes the whole feature a no-op until an
        organization actually exists.
        """
        if not username:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT m.org_id, m.role, o.name AS org_name, o.slug, o.archived_at, "
                "       o.default_plan_type, o.default_credits, o.default_token_limit, "
                "       o.default_storage_bytes, o.project_limit, o.allow_member_projects "
                "FROM org_members m JOIN organizations o ON o.org_id=m.org_id "
                "WHERE m.username=?",
                [username],
            ).fetchone()
        if not row:
            return None
        record = dict(row)
        record["allow_member_projects"] = bool(record["allow_member_projects"])
        return record

    def membership_map(self, usernames: Sequence[str] = ()) -> Dict[str, Dict[str, Any]]:
        """Bulk `membership_for`, so a user listing needs one query, not N."""
        sql = ("SELECT m.username, m.org_id, m.role, o.name AS org_name "
               "FROM org_members m JOIN organizations o ON o.org_id=m.org_id")
        params: List[Any] = []
        names = [u for u in usernames if u]
        if names:
            sql += f" WHERE m.username IN ({','.join('?' * len(names))})"
            params = names
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return {r["username"]: dict(r) for r in rows}

    def summary(self, org_id: str) -> Dict[str, Any]:
        return self.summaries().get(
            org_id,
            {"members": 0, "owners": 0, "projects": 0, "archived_projects": 0},
        )

    def summaries(self) -> Dict[str, Dict[str, Any]]:
        """Member/project counts for all orgs in two queries (not 4× per org)."""
        out: Dict[str, Dict[str, Any]] = {}
        with self._connect() as conn:
            for row in conn.execute(
                """
                SELECT org_id,
                       COUNT(*) AS members,
                       SUM(CASE WHEN role = 'owner' THEN 1 ELSE 0 END) AS owners
                FROM org_members
                GROUP BY org_id
                """
            ).fetchall():
                out[row["org_id"]] = {
                    "members": int(row["members"]),
                    "owners": int(row["owners"]),
                    "projects": 0,
                    "archived_projects": 0,
                }
            for row in conn.execute(
                """
                SELECT org_id,
                       SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) AS projects,
                       SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived_projects
                FROM projects
                GROUP BY org_id
                """
            ).fetchall():
                bucket = out.setdefault(
                    row["org_id"],
                    {"members": 0, "owners": 0, "projects": 0, "archived_projects": 0},
                )
                bucket["projects"] = int(row["projects"])
                bucket["archived_projects"] = int(row["archived_projects"])
        return out


def get_org_store() -> OrgStore:
    return OrgStore.instance()


__all__ = ["OrgStore", "get_org_store", "ORG_ROLES"]

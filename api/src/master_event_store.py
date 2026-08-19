"""Canonical repository for ingest-time construction event memory.

PostgreSQL is the production backend (Cloud SQL, safe across Cloud Run
instances).  DuckDB implements the same contract for local development, tests
and offline backfills; it is never selected when EVENT_DATABASE_URL is set.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Mapping, Optional, Sequence

from .config import STORAGE_DIR
from .database import postgres_connect_kwargs


EVENT_INDEX_VERSION = "master-events-v1"
VALID_INDEX_STATES = {"not_started", "queued", "processing", "ready", "partial", "failed", "stale"}
MIGRATION_FILE = Path(__file__).resolve().parents[1] / "migrations" / "master_event" / "001_master_event_memory.sql"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


_DUCK_SCHEMA = """
CREATE TABLE IF NOT EXISTS document_event_versions (
 version_id VARCHAR PRIMARY KEY, project_id VARCHAR, doc_id VARCHAR, file_name VARCHAR,
 source_kind VARCHAR, content_sha256 VARCHAR, canonical_uri VARCHAR, canonical_sha256 VARCHAR,
 canonicalization_ms DOUBLE DEFAULT 0,
 active BOOLEAN DEFAULT TRUE, event_index_status VARCHAR DEFAULT 'queued', event_index_version VARCHAR,
 prompt_hash VARCHAR DEFAULT '', schema_hash VARCHAR DEFAULT '', jargon_hash VARCHAR DEFAULT '',
 observation_count INTEGER DEFAULT 0, cluster_count INTEGER DEFAULT 0,
 partial_reasons_json VARCHAR DEFAULT '[]', created_at VARCHAR, updated_at VARCHAR,
 UNIQUE(project_id, doc_id, content_sha256));
CREATE TABLE IF NOT EXISTS source_segments (
 segment_id VARCHAR PRIMARY KEY, version_id VARCHAR, project_id VARCHAR, ordinal INTEGER,
 locator_type VARCHAR, locator_json VARCHAR, artifact_record INTEGER, text_sha256 VARCHAR,
 char_count INTEGER, overlapping BOOLEAN DEFAULT FALSE, UNIQUE(version_id, ordinal));
CREATE TABLE IF NOT EXISTS event_extraction_runs (
 run_id VARCHAR PRIMARY KEY, version_id VARCHAR, project_id VARCHAR, model VARCHAR,
 prompt_hash VARCHAR, schema_hash VARCHAR, jargon_hash VARCHAR, status VARCHAR,
 input_tokens BIGINT DEFAULT 0, output_tokens BIGINT DEFAULT 0,
 estimated_cost_usd DOUBLE DEFAULT 0, error_code VARCHAR DEFAULT '',
 started_at VARCHAR, completed_at VARCHAR);
CREATE TABLE IF NOT EXISTS event_clusters (
 cluster_id VARCHAR PRIMARY KEY, project_id VARCHAR, normalized_date VARCHAR,
 event_type VARCHAR, canonical_actor VARCHAR, normalized_action_object VARCHAR, created_at VARCHAR);
CREATE TABLE IF NOT EXISTS event_cluster_relations (
 relation_id VARCHAR PRIMARY KEY, project_id VARCHAR, left_cluster_id VARCHAR,
 right_cluster_id VARCHAR, relation VARCHAR DEFAULT 'related_candidate',
 similarity DOUBLE, created_at VARCHAR,
 UNIQUE(project_id,left_cluster_id,right_cluster_id,relation));
CREATE TABLE IF NOT EXISTS event_observations (
 observation_id VARCHAR PRIMARY KEY, run_id VARCHAR, version_id VARCHAR, segment_id VARCHAR,
 project_id VARCHAR, cluster_id VARCHAR, event_type VARCHAR, actor VARCHAR, action_text VARCHAR,
 object_text VARCHAR, party_position VARCHAR, consequence VARCHAR, materiality VARCHAR,
 confidence VARCHAR, undated_material BOOLEAN, claim_start INTEGER, claim_end INTEGER,
 claim_quote VARCHAR, claim_sha256 VARCHAR, source_locator_json VARCHAR, search_text VARCHAR,
 active BOOLEAN DEFAULT TRUE, created_at VARCHAR);
CREATE TABLE IF NOT EXISTS event_cluster_members (
 cluster_id VARCHAR, observation_id VARCHAR, relation VARCHAR DEFAULT 'corroborates',
 PRIMARY KEY(cluster_id, observation_id));
CREATE TABLE IF NOT EXISTS event_dates (
 event_date_id VARCHAR PRIMARY KEY, observation_id VARCHAR, normalized_date VARCHAR,
 date_precision VARCHAR, date_role VARCHAR, evidence_start INTEGER, evidence_end INTEGER,
 evidence_text VARCHAR, evidence_sha256 VARCHAR, is_primary BOOLEAN DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS event_jargon_resolutions (
 resolution_id VARCHAR PRIMARY KEY, observation_id VARCHAR, term VARCHAR, canonical_term VARCHAR,
 selected_sense VARCHAR, sense_source VARCHAR, evidence_start INTEGER, evidence_end INTEGER,
 confidence VARCHAR);
CREATE TABLE IF NOT EXISTS project_jargon_candidates (
 candidate_id VARCHAR PRIMARY KEY, project_id VARCHAR, version_id VARCHAR, segment_id VARCHAR,
 term VARCHAR, definition VARCHAR, evidence_start INTEGER, evidence_end INTEGER,
 evidence_sha256 VARCHAR, status VARCHAR DEFAULT 'pending', created_at VARCHAR, updated_at VARCHAR,
 UNIQUE(project_id, term, definition, segment_id, evidence_start));
CREATE TABLE IF NOT EXISTS event_extraction_audit (
 audit_id VARCHAR PRIMARY KEY, run_id VARCHAR, segment_id VARCHAR, disposition VARCHAR,
 reason_code VARCHAR, detail_json VARCHAR, created_at VARCHAR);
CREATE TABLE IF NOT EXISTS event_index_jobs (
 job_id VARCHAR PRIMARY KEY, project_id VARCHAR, doc_id VARCHAR, version_id VARCHAR UNIQUE,
 status VARCHAR DEFAULT 'queued', attempts INTEGER DEFAULT 0, error_code VARCHAR DEFAULT '',
 requested_by VARCHAR DEFAULT '', created_at VARCHAR, started_at VARCHAR,
 completed_at VARCHAR, updated_at VARCHAR);
ALTER TABLE document_event_versions ADD COLUMN IF NOT EXISTS canonicalization_ms DOUBLE DEFAULT 0;
"""


class MasterEventStore:
    def __init__(self, *, database_url: str = "", duckdb_path: Optional[Path] = None):
        self.database_url = database_url or os.getenv("EVENT_DATABASE_URL", "").strip()
        if os.getenv("K_SERVICE") and not self.database_url:
            raise RuntimeError("event_store_cloud_sql_required_on_cloud_run")
        self.backend = "postgres" if self.database_url else "duckdb"
        self._lock = threading.RLock()
        self._pool = None
        self._duck = None
        if self.backend == "postgres":
            try:
                from psycopg_pool import ConnectionPool
            except ImportError as exc:
                raise RuntimeError("event_store_postgres_dependency_missing") from exc
            self._pool = ConnectionPool(
                conninfo=self.database_url,
                min_size=max(0, int(os.getenv("EVENT_DB_POOL_MIN", "0"))),
                max_size=max(1, int(os.getenv("EVENT_DB_POOL_MAX", "5"))),
                kwargs=postgres_connect_kwargs(),
                open=True,
            )
            self._migrate_postgres()
        else:
            import duckdb
            path = Path(duckdb_path or (Path(STORAGE_DIR) / "master_events" / "master_events.db"))
            from .chunk_store import CHUNKS_DB
            if path.resolve() == Path(CHUNKS_DB).resolve():
                raise RuntimeError("event_store_must_be_separate_from_chunk_store")
            path.parent.mkdir(parents=True, exist_ok=True)
            self._duck = duckdb.connect(str(path))
            self._duck.execute(_DUCK_SCHEMA)

    @contextmanager
    def _connection(self):
        if self.backend == "postgres":
            assert self._pool is not None
            with self._pool.connection() as connection:
                try:
                    yield connection
                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise
        else:
            assert self._duck is not None
            with self._lock:
                yield self._duck

    def _migrate_postgres(self) -> None:
        sql = MIGRATION_FILE.read_text(encoding="utf-8")
        with self._connection() as connection:
            connection.execute(sql)

    def _execute(self, connection, sql: str, params: Sequence = ()):
        if self.backend == "postgres":
            sql = sql.replace("?", "%s")
        return connection.execute(sql, list(params))

    @staticmethod
    def _dict_rows(cursor) -> List[Dict]:
        if not cursor.description:
            return []
        cols = [item.name if hasattr(item, "name") else item[0] for item in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]

    def register_artifact(self, artifact, *, prompt_hash: str = "", schema_hash: str = "",
                          jargon_hash: str = "") -> Dict:
        now = _now()
        with self._connection() as con:
            self._execute(con,
                "UPDATE document_event_versions SET active=FALSE,event_index_status='stale',updated_at=? "
                "WHERE project_id=? AND doc_id=? AND version_id<>? AND active=TRUE",
                [now, artifact.project_id, artifact.doc_id, artifact.version_id])
            params = [
                artifact.version_id, artifact.project_id, artifact.doc_id, artifact.file_name,
                artifact.source_kind, artifact.content_sha256, artifact.uri,
                artifact.canonical_sha256, float(getattr(artifact, "canonicalization_ms", 0)),
                True, "queued", EVENT_INDEX_VERSION,
                prompt_hash, schema_hash, jargon_hash, 0, 0, "[]", now, now,
            ]
            self._execute(con,
                "INSERT INTO document_event_versions "
                "(version_id,project_id,doc_id,file_name,source_kind,content_sha256,canonical_uri,"
                "canonical_sha256,canonicalization_ms,active,event_index_status,event_index_version,prompt_hash,schema_hash,"
                "jargon_hash,observation_count,cluster_count,partial_reasons_json,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(version_id) DO UPDATE SET active=TRUE,canonical_uri=excluded.canonical_uri,"
                "event_index_status=CASE WHEN document_event_versions.event_index_status='ready' "
                "THEN 'ready' ELSE 'queued' END,updated_at=excluded.updated_at",
                params)
            self._execute(con, "DELETE FROM source_segments WHERE version_id=?", [artifact.version_id])
            for row in artifact.segments:
                self._execute(con,
                    "INSERT INTO source_segments "
                    "(segment_id,version_id,project_id,ordinal,locator_type,locator_json,artifact_record,"
                    "text_sha256,char_count,overlapping) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    [row.segment_id, artifact.version_id, artifact.project_id, row.ordinal,
                     row.locator_type, _json(row.locator), row.ordinal, row.text_sha256,
                     len(row.text), row.overlapping])
        return self.get_version(artifact.project_id, artifact.version_id) or {}

    def get_version(self, project_id: str, version_id: str) -> Optional[Dict]:
        if not project_id:
            raise ValueError("project_id is required")
        with self._connection() as con:
            rows = self._dict_rows(self._execute(con,
                "SELECT * FROM document_event_versions WHERE project_id=? AND version_id=?",
                [project_id, version_id]))
        if not rows:
            return None
        value = rows[0]
        value["partial_reasons"] = self._decode_json(value.pop("partial_reasons_json", "[]"), [])
        return value

    def active_version_for_document(self, project_id: str, doc_id: str) -> Optional[Dict]:
        with self._connection() as con:
            rows = self._dict_rows(self._execute(con,
                "SELECT * FROM document_event_versions WHERE project_id=? AND doc_id=? "
                "AND active=TRUE ORDER BY created_at DESC LIMIT 1", [project_id, doc_id]))
        return rows[0] if rows else None

    @staticmethod
    def _decode_json(value, default):
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value or "")
        except Exception:
            return default

    def enqueue_index(self, project_id: str, doc_id: str, version_id: str,
                      requested_by: str = "", force: bool = False) -> Dict:
        job_id, now = uuid.uuid4().hex[:24], _now()
        with self._connection() as con:
            self._execute(con,
                "INSERT INTO event_index_jobs "
                "(job_id,project_id,doc_id,version_id,status,attempts,error_code,requested_by,"
                "created_at,started_at,completed_at,updated_at) "
                "VALUES (?,?,?,?,'queued',0,'',?,?,NULL,NULL,?) "
                "ON CONFLICT(version_id) DO UPDATE SET status=CASE "
                "WHEN event_index_jobs.status IN ('ready','processing') THEN event_index_jobs.status "
                "ELSE 'queued' END,error_code='',requested_by=excluded.requested_by,"
                "updated_at=excluded.updated_at",
                [job_id, project_id, doc_id, version_id, requested_by, now, now])
            self._execute(con,
                "UPDATE document_event_versions SET event_index_status=CASE "
                "WHEN event_index_status IN ('ready','processing') THEN event_index_status "
                "ELSE 'queued' END,updated_at=? WHERE project_id=? AND version_id=?",
                [now, project_id, version_id])
            if force:
                self._execute(con,
                    "UPDATE event_index_jobs SET status='queued',error_code='',completed_at=NULL,updated_at=? "
                    "WHERE project_id=? AND version_id=? AND status<>'processing'",
                    [now, project_id, version_id])
                self._execute(con,
                    "UPDATE document_event_versions SET event_index_status='queued',updated_at=? "
                    "WHERE project_id=? AND version_id=? AND EXISTS ("
                    "SELECT 1 FROM event_index_jobs j WHERE j.version_id=document_event_versions.version_id "
                    "AND j.status='queued')",
                    [now, project_id, version_id])
            rows = self._dict_rows(self._execute(con,
                "SELECT * FROM event_index_jobs WHERE project_id=? AND version_id=?",
                [project_id, version_id]))
        return rows[0]

    def enqueue_gap_reindex(self, project_id: str, doc_ids: Sequence[str]) -> List[str]:
        queued: List[str] = []
        for doc_id in dict.fromkeys(str(value) for value in doc_ids if value):
            version = self.active_version_for_document(project_id, doc_id)
            if not version or version.get("event_index_status") in {"queued", "processing"}:
                continue
            self.enqueue_index(
                project_id, doc_id, str(version["version_id"]),
                requested_by="chronology_gap", force=True,
            )
            queued.append(doc_id)
        return queued

    def recover_interrupted_jobs(self) -> int:
        with self._connection() as con:
            cursor = self._execute(con,
                "UPDATE event_index_jobs SET status='queued',error_code='',updated_at=? "
                "WHERE status='processing'", [_now()])
            self._execute(con,
                "UPDATE document_event_versions SET event_index_status='queued',updated_at=? "
                "WHERE event_index_status='processing'", [_now()])
            return int(cursor.rowcount or 0)

    def claim_index_job(self) -> Optional[Dict]:
        now = _now()
        with self._connection() as con:
            if self.backend == "postgres":
                cursor = con.execute(
                    "SELECT * FROM event_index_jobs WHERE status='queued' ORDER BY created_at "
                    "FOR UPDATE SKIP LOCKED LIMIT 1")
            else:
                cursor = con.execute(
                    "SELECT * FROM event_index_jobs WHERE status='queued' ORDER BY created_at LIMIT 1")
            rows = self._dict_rows(cursor)
            if not rows:
                return None
            job = rows[0]
            self._execute(con,
                "UPDATE event_index_jobs SET status='processing',attempts=attempts+1,"
                "started_at=COALESCE(started_at,?),updated_at=? WHERE job_id=? AND status='queued'",
                [now, now, job["job_id"]])
            self._execute(con,
                "UPDATE document_event_versions SET event_index_status='processing',updated_at=? "
                "WHERE project_id=? AND version_id=?", [now, job["project_id"], job["version_id"]])
            rows = self._dict_rows(self._execute(con,
                "SELECT * FROM event_index_jobs WHERE job_id=?", [job["job_id"]]))
            return rows[0] if rows else None

    def begin_run(self, *, project_id: str, version_id: str, model: str, prompt_hash: str,
                  schema_hash: str, jargon_hash: str) -> str:
        run_id = hashlib.sha256(
            f"{version_id}|{prompt_hash}|{schema_hash}|{jargon_hash}".encode()
        ).hexdigest()[:32]
        with self._connection() as con:
            old_observations = self._dict_rows(self._execute(con,
                "SELECT observation_id FROM event_observations WHERE run_id=?", [run_id]))
            for row in old_observations:
                self._execute(con, "DELETE FROM event_dates WHERE observation_id=?", [row["observation_id"]])
                self._execute(con, "DELETE FROM event_jargon_resolutions WHERE observation_id=?", [row["observation_id"]])
                self._execute(con, "DELETE FROM event_cluster_members WHERE observation_id=?", [row["observation_id"]])
            self._execute(con,
                "INSERT INTO event_extraction_runs "
                "(run_id,version_id,project_id,model,prompt_hash,schema_hash,jargon_hash,status,"
                "input_tokens,output_tokens,estimated_cost_usd,error_code,started_at,completed_at) "
                "VALUES (?,?,?,?,?,?,?,'processing',0,0,0,'',?,NULL) "
                "ON CONFLICT(run_id) DO UPDATE SET status='processing',error_code='',started_at=excluded.started_at,"
                "completed_at=NULL",
                [run_id, version_id, project_id, model, prompt_hash, schema_hash, jargon_hash, _now()])
            # A rerun of the same contract must replace, not duplicate, its observations.
            self._execute(con, "DELETE FROM event_observations WHERE run_id=?", [run_id])
            self._execute(con, "DELETE FROM event_extraction_audit WHERE run_id=?", [run_id])
            self._execute(con,
                "UPDATE document_event_versions SET prompt_hash=?,schema_hash=?,jargon_hash=?,updated_at=? "
                "WHERE project_id=? AND version_id=?",
                [prompt_hash, schema_hash, jargon_hash, _now(), project_id, version_id])
        return run_id

    def write_audit(self, run_id: str, segment_id: str, disposition: str,
                    reason_code: str, detail: Optional[Mapping] = None) -> None:
        audit_id = hashlib.sha256(
            f"{run_id}|{segment_id}|{disposition}|{reason_code}|{_json(detail or {})}".encode()
        ).hexdigest()[:32]
        with self._connection() as con:
            self._execute(con,
                "INSERT INTO event_extraction_audit "
                "(audit_id,run_id,segment_id,disposition,reason_code,detail_json,created_at) "
                "VALUES (?,?,?,?,?,?,?) ON CONFLICT(audit_id) DO NOTHING",
                [audit_id, run_id, segment_id, disposition, reason_code, _json(detail or {}), _now()])

    def persist_observations(self, project_id: str, run_id: str, version_id: str,
                             observations: Iterable[Mapping]) -> int:
        inserted = 0
        with self._connection() as con:
            for item in observations:
                cluster = item["cluster"]
                self._execute(con,
                    "INSERT INTO event_clusters "
                    "(cluster_id,project_id,normalized_date,event_type,canonical_actor,"
                    "normalized_action_object,created_at) VALUES (?,?,?,?,?,?,?) "
                    "ON CONFLICT(cluster_id) DO NOTHING",
                    [cluster["cluster_id"], project_id, cluster.get("normalized_date", ""),
                     cluster["event_type"], cluster.get("canonical_actor", ""),
                     cluster["normalized_action_object"], _now()])
                values = [
                    item["observation_id"], run_id, version_id, item["segment_id"], project_id,
                    cluster["cluster_id"], item["event_type"], item.get("actor", ""),
                    item["action_text"], item.get("object_text", ""), item.get("party_position", ""),
                    item.get("consequence", ""), item["materiality"], item["confidence"],
                    bool(item.get("undated_material")), int(item["claim_start"]), int(item["claim_end"]),
                    item["claim_quote"], item["claim_sha256"], _json(item["source_locator"]),
                    item["search_text"], True, _now(),
                ]
                self._execute(con,
                    "INSERT INTO event_observations "
                    "(observation_id,run_id,version_id,segment_id,project_id,cluster_id,event_type,actor,"
                    "action_text,object_text,party_position,consequence,materiality,confidence,undated_material,"
                    "claim_start,claim_end,claim_quote,claim_sha256,source_locator_json,search_text,active,created_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(observation_id) DO NOTHING", values)
                inserted += 1
                self._execute(con,
                    "INSERT INTO event_cluster_members(cluster_id,observation_id,relation) VALUES (?,?,'corroborates') "
                    "ON CONFLICT(cluster_id,observation_id) DO NOTHING",
                    [cluster["cluster_id"], item["observation_id"]])
                date = item.get("date")
                if date:
                    self._execute(con,
                        "INSERT INTO event_dates "
                        "(event_date_id,observation_id,normalized_date,date_precision,date_role,evidence_start,"
                        "evidence_end,evidence_text,evidence_sha256,is_primary) VALUES (?,?,?,?,?,?,?,?,?,?) "
                        "ON CONFLICT(event_date_id) DO NOTHING",
                        [date["event_date_id"], item["observation_id"], date["normalized_date"],
                         date["date_precision"], date["date_role"], date["evidence_start"],
                         date["evidence_end"], date["evidence_text"], date["evidence_sha256"],
                         bool(date.get("is_primary", True))])
                for term in item.get("jargon", []):
                    self._execute(con,
                        "INSERT INTO event_jargon_resolutions "
                        "(resolution_id,observation_id,term,canonical_term,selected_sense,sense_source,"
                        "evidence_start,evidence_end,confidence) VALUES (?,?,?,?,?,?,?,?,?) "
                        "ON CONFLICT(resolution_id) DO NOTHING",
                        [term["resolution_id"], item["observation_id"], term["term"],
                         term["canonical_term"], term["selected_sense"], term["sense_source"],
                         term["evidence_start"], term["evidence_end"], term["confidence"]])
        return inserted

    def link_related_clusters(self, project_id: str, cluster_ids: Sequence[str]) -> int:
        """Persist fuzzy leads while leaving both exact clusters untouched."""
        ids = list(dict.fromkeys(str(value) for value in cluster_ids if value))
        if not ids:
            return 0
        with self._connection() as con:
            rows = self._dict_rows(self._execute(con,
                "SELECT cluster_id,normalized_date,event_type,canonical_actor,normalized_action_object "
                "FROM event_clusters WHERE project_id=?", [project_id]))
            created = 0
            new_ids = set(ids)
            for left_index, left in enumerate(rows):
                for right in rows[left_index + 1:]:
                    left_id, right_id = sorted((str(left["cluster_id"]), str(right["cluster_id"])))
                    if not ({left_id, right_id} & new_ids):
                        continue
                    if left["event_type"] != right["event_type"]:
                        continue
                    if (left.get("normalized_date") and right.get("normalized_date")
                            and left["normalized_date"] != right["normalized_date"]):
                        continue
                    if (left.get("canonical_actor") and right.get("canonical_actor")
                            and left["canonical_actor"] != right["canonical_actor"]):
                        continue
                    left_terms = set(str(left.get("normalized_action_object") or "").split())
                    right_terms = set(str(right.get("normalized_action_object") or "").split())
                    union = left_terms | right_terms
                    similarity = len(left_terms & right_terms) / len(union) if union else 0.0
                    if similarity < .6:
                        continue
                    relation_id = hashlib.sha256(
                        f"{project_id}|{left_id}|{right_id}|related_candidate".encode()
                    ).hexdigest()[:32]
                    self._execute(con,
                        "INSERT INTO event_cluster_relations "
                        "(relation_id,project_id,left_cluster_id,right_cluster_id,relation,similarity,created_at) "
                        "VALUES (?,?,?,?,'related_candidate',?,?) ON CONFLICT(relation_id) DO NOTHING",
                        [relation_id, project_id, left_id, right_id, similarity, _now()])
                    created += 1
        return created

    def stage_jargon_candidate(self, *, project_id: str, version_id: str, segment_id: str,
                               term: str, definition: str, start: int, end: int,
                               evidence_sha256: str) -> None:
        candidate_id = hashlib.sha256(
            f"{project_id}|{term.casefold()}|{definition.casefold()}|{segment_id}|{start}".encode()
        ).hexdigest()[:32]
        with self._connection() as con:
            self._execute(con,
                "INSERT INTO project_jargon_candidates "
                "(candidate_id,project_id,version_id,segment_id,term,definition,evidence_start,evidence_end,"
                "evidence_sha256,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?) "
                "ON CONFLICT(project_id,term,definition,segment_id,evidence_start) DO NOTHING",
                [candidate_id, project_id, version_id, segment_id, term, definition,
                 start, end, evidence_sha256, _now(), _now()])

    def approved_project_terms(self, project_id: str) -> Dict[str, str]:
        with self._connection() as con:
            rows = self._dict_rows(self._execute(con,
                "SELECT term,definition FROM project_jargon_candidates "
                "WHERE project_id=? AND status='approved'", [project_id]))
        return {str(row["term"]): str(row["definition"]) for row in rows}

    def list_jargon_candidates(self, project_id: str, *, status: str = "") -> List[Dict]:
        if not project_id:
            raise ValueError("project_id is required")
        params: List[object] = [project_id]
        sql = ("SELECT candidate_id,project_id,version_id,segment_id,term,definition,"
               "evidence_start,evidence_end,evidence_sha256,status,created_at,updated_at "
               "FROM project_jargon_candidates WHERE project_id=?")
        if status:
            if status not in {"pending", "approved", "rejected"}:
                raise ValueError("invalid jargon candidate status")
            sql += " AND status=?"; params.append(status)
        sql += " ORDER BY updated_at DESC"
        with self._connection() as con:
            return self._dict_rows(self._execute(con, sql, params))

    def set_jargon_candidate_status(self, *, project_id: str, candidate_id: str,
                                    status: str) -> Optional[Dict]:
        if status not in {"pending", "approved", "rejected"}:
            raise ValueError("invalid jargon candidate status")
        with self._connection() as con:
            self._execute(con,
                "UPDATE project_jargon_candidates SET status=?,updated_at=? "
                "WHERE project_id=? AND candidate_id=?",
                [status, _now(), project_id, candidate_id])
            rows = self._dict_rows(self._execute(con,
                "SELECT * FROM project_jargon_candidates WHERE project_id=? AND candidate_id=?",
                [project_id, candidate_id]))
        return rows[0] if rows else None

    def finish_run(self, *, project_id: str, version_id: str, run_id: str,
                   status: str, input_tokens: int = 0, output_tokens: int = 0,
                   estimated_cost_usd: float = 0, error_code: str = "",
                   partial_reasons: Sequence[str] = ()) -> None:
        if status not in {"ready", "partial", "failed"}:
            raise ValueError("invalid event-index terminal status")
        with self._connection() as con:
            self._execute(con,
                "UPDATE event_extraction_runs SET status=?,input_tokens=?,output_tokens=?,"
                "estimated_cost_usd=?,error_code=?,completed_at=? WHERE run_id=? AND project_id=?",
                [status, int(input_tokens), int(output_tokens), float(estimated_cost_usd),
                 error_code, _now(), run_id, project_id])
            counts = self._dict_rows(self._execute(con,
                "SELECT COUNT(*) AS observations,COUNT(DISTINCT cluster_id) AS clusters "
                "FROM event_observations WHERE project_id=? AND version_id=? AND active=TRUE",
                [project_id, version_id]))[0]
            self._execute(con,
                "UPDATE document_event_versions SET event_index_status=?,observation_count=?,cluster_count=?,"
                "partial_reasons_json=?,updated_at=? WHERE project_id=? AND version_id=?",
                [status, int(counts["observations"]), int(counts["clusters"]),
                 _json(list(partial_reasons)), _now(), project_id, version_id])
            job_status = "ready" if status in {"ready", "partial"} else "failed"
            self._execute(con,
                "UPDATE event_index_jobs SET status=?,error_code=?,completed_at=?,updated_at=? "
                "WHERE project_id=? AND version_id=?",
                [job_status, error_code, _now(), _now(), project_id, version_id])

    def fail_index_job(self, *, project_id: str, version_id: str,
                       error_code: str = "event_index_failed") -> None:
        """Put a claimed job in a stable terminal state even if no run exists yet."""
        code = str(error_code or "event_index_failed")[:80]
        with self._connection() as con:
            self._execute(con,
                "UPDATE document_event_versions SET event_index_status='failed',"
                "partial_reasons_json=?,updated_at=? WHERE project_id=? AND version_id=?",
                [_json([code]), _now(), project_id, version_id])
            self._execute(con,
                "UPDATE event_index_jobs SET status='failed',error_code=?,completed_at=?,updated_at=? "
                "WHERE project_id=? AND version_id=?",
                [code, _now(), _now(), project_id, version_id])

    def project_status(self, project_id: str) -> Dict:
        if not project_id:
            raise ValueError("project_id is required")
        with self._connection() as con:
            rows = self._dict_rows(self._execute(con,
                "SELECT event_index_status,COUNT(*) AS count,SUM(observation_count) AS observations,"
                "SUM(cluster_count) AS clusters FROM document_event_versions "
                "WHERE project_id=? AND active=TRUE GROUP BY event_index_status", [project_id]))
        states = {state: 0 for state in VALID_INDEX_STATES}
        observations = clusters = 0
        for row in rows:
            states[str(row["event_index_status"])] = int(row["count"] or 0)
            observations += int(row["observations"] or 0)
            clusters += int(row["clusters"] or 0)
        incomplete = [state for state in ("not_started", "queued", "processing", "partial", "failed", "stale")
                      if states[state]]
        return {"states": states, "observation_count": observations, "cluster_count": clusters,
                "complete": not incomplete and states["ready"] > 0,
                "partial_reasons": [f"event_index_{state}" for state in incomplete]}

    def project_metrics(self, project_id: str) -> Dict:
        """Bounded operational telemetry without source text or provider errors."""
        if not project_id:
            raise ValueError("project_id is required")
        with self._connection() as con:
            runs = self._dict_rows(self._execute(con,
                "SELECT status,input_tokens,output_tokens,estimated_cost_usd,started_at,completed_at "
                "FROM event_extraction_runs WHERE project_id=?", [project_id]))
            segments = self._dict_rows(self._execute(con,
                "SELECT COUNT(*) AS count,COALESCE(SUM(char_count),0) AS characters "
                "FROM source_segments WHERE project_id=?", [project_id]))[0]
            dispositions = self._dict_rows(self._execute(con,
                "SELECT a.disposition,COUNT(*) AS count FROM event_extraction_audit a "
                "JOIN event_extraction_runs r ON r.run_id=a.run_id "
                "WHERE r.project_id=? GROUP BY a.disposition", [project_id]))
            jobs = self._dict_rows(self._execute(con,
                "SELECT status,COUNT(*) AS count,COALESCE(SUM(attempts),0) AS attempts "
                "FROM event_index_jobs WHERE project_id=? GROUP BY status", [project_id]))
            canonical = self._dict_rows(self._execute(con,
                "SELECT canonicalization_ms FROM document_event_versions "
                "WHERE project_id=?", [project_id]))

        def seconds(start, end) -> Optional[float]:
            if not start or not end:
                return None
            try:
                if isinstance(start, datetime) and isinstance(end, datetime):
                    return max(0.0, (end - start).total_seconds())
                return max(0.0, (
                    datetime.fromisoformat(str(end)) - datetime.fromisoformat(str(start))
                ).total_seconds())
            except Exception:
                return None

        def percentile(values: Sequence[float], ratio: float) -> float:
            ordered = sorted(float(value) for value in values)
            if not ordered:
                return 0.0
            return round(ordered[min(len(ordered) - 1, int((len(ordered) - 1) * ratio))], 3)

        durations = [value for row in runs
                     if (value := seconds(row.get("started_at"), row.get("completed_at"))) is not None]
        canonical_ms = [float(row.get("canonicalization_ms") or 0) for row in canonical]
        return {
            "documents": len(canonical), "segments": int(segments["count"] or 0),
            "canonical_characters": int(segments["characters"] or 0),
            "canonicalization_ms": {"p50": percentile(canonical_ms, .5),
                                      "p95": percentile(canonical_ms, .95)},
            "event_index_seconds": {"p50": percentile(durations, .5),
                                      "p95": percentile(durations, .95)},
            "model_usage": {
                "input_tokens": sum(int(row.get("input_tokens") or 0) for row in runs),
                "output_tokens": sum(int(row.get("output_tokens") or 0) for row in runs),
                "estimated_cost_usd": round(sum(
                    float(row.get("estimated_cost_usd") or 0) for row in runs
                ), 6),
            },
            "audit_dispositions": {str(row["disposition"]): int(row["count"] or 0)
                                   for row in dispositions},
            "jobs": {str(row["status"]): {"count": int(row["count"] or 0),
                                             "attempts": int(row["attempts"] or 0)}
                     for row in jobs},
        }

    def incomplete_documents(self, project_id: str) -> List[str]:
        with self._connection() as con:
            rows = self._dict_rows(self._execute(con,
                "SELECT doc_id FROM document_event_versions WHERE project_id=? AND active=TRUE "
                "AND event_index_status NOT IN ('ready')", [project_id]))
        return list(dict.fromkeys(str(row["doc_id"]) for row in rows if row.get("doc_id")))

    def search_observations(self, *, project_id: str, query: str,
                            date_from: str = "", date_to: str = "",
                            parties: Sequence[str] = (), event_types: Sequence[str] = (),
                            limit: int = 240) -> List[Dict]:
        if not project_id:
            raise ValueError("project_id is required")
        terms = [token.casefold() for token in query.split() if len(token) > 2]
        fts_terms = [value for term in terms[:24]
                     if (value := re.sub(r"[^a-z0-9]+", "", term))]
        with self._connection() as con:
            sql = (
                "SELECT o.*,d.normalized_date,d.date_precision,d.date_role,d.evidence_text AS date_evidence,"
                "d.evidence_start AS date_start,d.evidence_end AS date_end,v.doc_id,v.file_name,v.source_kind "
                "FROM event_observations o JOIN document_event_versions v ON v.version_id=o.version_id "
                "LEFT JOIN event_dates d ON d.observation_id=o.observation_id AND d.is_primary=TRUE "
                "WHERE o.project_id=? AND o.active=TRUE AND v.active=TRUE "
                "AND v.event_index_status IN ('ready','partial')")
            params: List[object] = [project_id]
            if self.backend == "postgres" and fts_terms:
                sql += " AND to_tsvector('simple',o.search_text) @@ to_tsquery('simple',?)"
                params.append(" | ".join(fts_terms))
            if date_from:
                # A month/year precision event represents an interval. Compare
                # its expanded end against the requested lower bound so e.g.
                # 2024-03 is not lost from a search starting on 2024-03-15.
                sql += (" AND (d.normalized_date='' OR CASE LENGTH(d.normalized_date) "
                        "WHEN 4 THEN d.normalized_date||'-12-31' "
                        "WHEN 7 THEN d.normalized_date||'-31' "
                        "ELSE d.normalized_date END>=?)")
                params.append(date_from)
            if date_to:
                sql += (" AND (d.normalized_date='' OR CASE LENGTH(d.normalized_date) "
                        "WHEN 4 THEN d.normalized_date||'-01-01' "
                        "WHEN 7 THEN d.normalized_date||'-01' "
                        "ELSE d.normalized_date END<=?)")
                params.append(date_to)
            if event_types:
                sql += f" AND o.event_type IN ({','.join('?' for _ in event_types)})"
                params.extend(list(event_types))
            rows = self._dict_rows(self._execute(con, sql, params))
        party_terms = [value.casefold() for value in parties if value.strip()]
        allowed_types = {value.casefold() for value in event_types if value.strip()}
        filtered: List[Dict] = []
        for row in rows:
            blob = str(row.get("search_text") or "").casefold()
            # `parties` is a planner filter, not merely a ranking suggestion.
            # Without this gate a strong topic match from unrelated parties can
            # enter an issue chronology despite an explicit party scope.
            if party_terms and not any(value in blob for value in party_terms):
                continue
            lexical = sum(1 for term in terms if term in blob) / max(1, len(terms))
            party = 0.0 if not party_terms else max(
                (1.0 if value in blob else 0.0 for value in party_terms), default=0.0)
            type_score = (1.0 if allowed_types and
                          str(row.get("event_type") or "").casefold() in allowed_types else 0.0)
            row["score"] = lexical * .65 + party * .2 + type_score * .15
            row["source_locator"] = self._decode_json(row.get("source_locator_json"), {})
            if row["score"] > 0 or not terms:
                filtered.append(row)
        return sorted(filtered, key=lambda row: (
            -float(row["score"]), str(row.get("normalized_date") or "9999")
        ))[:limit]

    def observations_by_ids(self, *, project_id: str,
                            observation_ids: Sequence[str]) -> List[Dict]:
        ids = list(dict.fromkeys(str(value) for value in observation_ids if value))
        if not ids:
            return []
        placeholders = ",".join("?" for _ in ids)
        with self._connection() as con:
            rows = self._dict_rows(self._execute(con,
                "SELECT o.*,d.normalized_date,d.date_precision,d.date_role,"
                "d.evidence_text AS date_evidence,d.evidence_start AS date_start,"
                "d.evidence_end AS date_end,v.doc_id,v.file_name,v.source_kind "
                "FROM event_observations o JOIN document_event_versions v ON v.version_id=o.version_id "
                "LEFT JOIN event_dates d ON d.observation_id=o.observation_id AND d.is_primary=TRUE "
                f"WHERE o.project_id=? AND o.active=TRUE AND v.active=TRUE "
                f"AND o.observation_id IN ({placeholders})",
                [project_id, *ids]))
        for row in rows:
            row["source_locator"] = self._decode_json(row.get("source_locator_json"), {})
            row["score"] = 0.0
        return rows

    def purge_document(self, project_id: str, doc_id: str) -> List[str]:
        if not project_id:
            raise ValueError("project_id is required")
        with self._connection() as con:
            rows = self._dict_rows(self._execute(con,
                "SELECT canonical_uri FROM document_event_versions WHERE project_id=? AND doc_id=?",
                [project_id, doc_id]))
            # PostgreSQL cascades; DuckDB local schema intentionally has no FKs, so delete explicitly.
            version_rows = self._dict_rows(self._execute(con,
                "SELECT version_id FROM document_event_versions WHERE project_id=? AND doc_id=?",
                [project_id, doc_id]))
            versions = [row["version_id"] for row in version_rows]
            for version in versions:
                obs = self._dict_rows(self._execute(con,
                    "SELECT observation_id,cluster_id FROM event_observations WHERE version_id=?", [version]))
                cluster_ids = list(dict.fromkeys(str(item["cluster_id"]) for item in obs))
                for item in obs:
                    self._execute(con, "DELETE FROM event_dates WHERE observation_id=?", [item["observation_id"]])
                    self._execute(con, "DELETE FROM event_jargon_resolutions WHERE observation_id=?", [item["observation_id"]])
                    self._execute(con, "DELETE FROM event_cluster_members WHERE observation_id=?", [item["observation_id"]])
                self._execute(con, "DELETE FROM event_observations WHERE version_id=?", [version])
                self._execute(con, "DELETE FROM event_extraction_audit WHERE run_id IN "
                                  "(SELECT run_id FROM event_extraction_runs WHERE version_id=?)", [version])
                self._execute(con, "DELETE FROM event_extraction_runs WHERE version_id=?", [version])
                self._execute(con, "DELETE FROM project_jargon_candidates WHERE version_id=?", [version])
                self._execute(con, "DELETE FROM source_segments WHERE version_id=?", [version])
                self._execute(con, "DELETE FROM event_index_jobs WHERE version_id=?", [version])
                self._execute(con, "DELETE FROM document_event_versions WHERE version_id=?", [version])
                for cluster_id in cluster_ids:
                    remaining = self._dict_rows(self._execute(con,
                        "SELECT COUNT(*) AS count FROM event_cluster_members WHERE cluster_id=?",
                        [cluster_id]))[0]
                    if int(remaining["count"] or 0) == 0:
                        self._execute(con,
                            "DELETE FROM event_cluster_relations WHERE left_cluster_id=? OR right_cluster_id=?",
                            [cluster_id, cluster_id])
                        self._execute(con, "DELETE FROM event_clusters WHERE cluster_id=?", [cluster_id])
            self._execute(con, "DELETE FROM event_cluster_relations WHERE project_id=? AND "
                              "(left_cluster_id NOT IN (SELECT cluster_id FROM event_clusters) OR "
                              "right_cluster_id NOT IN (SELECT cluster_id FROM event_clusters))",
                              [project_id])
            self._execute(con, "DELETE FROM event_clusters WHERE project_id=? AND cluster_id NOT IN "
                              "(SELECT DISTINCT cluster_id FROM event_observations WHERE project_id=?)",
                              [project_id, project_id])
        return [str(row["canonical_uri"]) for row in rows]


_instance: Optional[MasterEventStore] = None
_instance_lock = threading.Lock()


def get_master_event_store() -> MasterEventStore:
    global _instance
    if _instance is None:
        with _instance_lock:
            if _instance is None:
                _instance = MasterEventStore()
    return _instance


__all__ = [
    "EVENT_INDEX_VERSION", "MasterEventStore", "VALID_INDEX_STATES", "get_master_event_store",
]

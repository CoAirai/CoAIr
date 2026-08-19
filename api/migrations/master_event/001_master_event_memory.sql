CREATE TABLE IF NOT EXISTS document_event_versions (
    version_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    canonical_uri TEXT NOT NULL,
    canonical_sha256 TEXT NOT NULL,
    canonicalization_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    event_index_status TEXT NOT NULL DEFAULT 'queued',
    event_index_version TEXT NOT NULL,
    prompt_hash TEXT NOT NULL DEFAULT '',
    schema_hash TEXT NOT NULL DEFAULT '',
    jargon_hash TEXT NOT NULL DEFAULT '',
    observation_count INTEGER NOT NULL DEFAULT 0,
    cluster_count INTEGER NOT NULL DEFAULT 0,
    partial_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, doc_id, content_sha256)
);
CREATE INDEX IF NOT EXISTS idx_event_versions_project_active
    ON document_event_versions(project_id, active, event_index_status);

CREATE TABLE IF NOT EXISTS source_segments (
    segment_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES document_event_versions(version_id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    locator_type TEXT NOT NULL,
    locator_json JSONB NOT NULL,
    artifact_record INTEGER NOT NULL,
    text_sha256 TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    overlapping BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(version_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_source_segments_version ON source_segments(version_id, ordinal);

CREATE TABLE IF NOT EXISTS event_extraction_runs (
    run_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES document_event_versions(version_id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    schema_hash TEXT NOT NULL,
    jargon_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS event_clusters (
    cluster_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    normalized_date TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    canonical_actor TEXT NOT NULL DEFAULT '',
    normalized_action_object TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_clusters_project_date
    ON event_clusters(project_id, normalized_date, event_type);

CREATE TABLE IF NOT EXISTS event_cluster_relations (
    relation_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    left_cluster_id TEXT NOT NULL REFERENCES event_clusters(cluster_id) ON DELETE CASCADE,
    right_cluster_id TEXT NOT NULL REFERENCES event_clusters(cluster_id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT 'related_candidate',
    similarity DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, left_cluster_id, right_cluster_id, relation)
);

CREATE TABLE IF NOT EXISTS event_observations (
    observation_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES event_extraction_runs(run_id) ON DELETE CASCADE,
    version_id TEXT NOT NULL REFERENCES document_event_versions(version_id) ON DELETE CASCADE,
    segment_id TEXT NOT NULL REFERENCES source_segments(segment_id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    cluster_id TEXT NOT NULL REFERENCES event_clusters(cluster_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT '',
    action_text TEXT NOT NULL,
    object_text TEXT NOT NULL DEFAULT '',
    party_position TEXT NOT NULL DEFAULT '',
    consequence TEXT NOT NULL DEFAULT '',
    materiality TEXT NOT NULL,
    confidence TEXT NOT NULL,
    undated_material BOOLEAN NOT NULL DEFAULT FALSE,
    claim_start INTEGER NOT NULL,
    claim_end INTEGER NOT NULL,
    claim_quote TEXT NOT NULL,
    claim_sha256 TEXT NOT NULL,
    source_locator_json JSONB NOT NULL,
    search_text TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_observations_project_active
    ON event_observations(project_id, active, event_type);
CREATE INDEX IF NOT EXISTS idx_event_observations_search
    ON event_observations USING GIN (to_tsvector('simple', search_text));

CREATE TABLE IF NOT EXISTS event_cluster_members (
    cluster_id TEXT NOT NULL REFERENCES event_clusters(cluster_id) ON DELETE CASCADE,
    observation_id TEXT NOT NULL REFERENCES event_observations(observation_id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT 'corroborates',
    PRIMARY KEY(cluster_id, observation_id)
);

CREATE TABLE IF NOT EXISTS event_dates (
    event_date_id TEXT PRIMARY KEY,
    observation_id TEXT NOT NULL REFERENCES event_observations(observation_id) ON DELETE CASCADE,
    normalized_date TEXT NOT NULL DEFAULT '',
    date_precision TEXT NOT NULL,
    date_role TEXT NOT NULL,
    evidence_start INTEGER NOT NULL,
    evidence_end INTEGER NOT NULL,
    evidence_text TEXT NOT NULL,
    evidence_sha256 TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_event_dates_value ON event_dates(normalized_date, date_role);

CREATE TABLE IF NOT EXISTS event_jargon_resolutions (
    resolution_id TEXT PRIMARY KEY,
    observation_id TEXT NOT NULL REFERENCES event_observations(observation_id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    canonical_term TEXT NOT NULL,
    selected_sense TEXT NOT NULL,
    sense_source TEXT NOT NULL,
    evidence_start INTEGER NOT NULL,
    evidence_end INTEGER NOT NULL,
    confidence TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_jargon_candidates (
    candidate_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    version_id TEXT NOT NULL REFERENCES document_event_versions(version_id) ON DELETE CASCADE,
    segment_id TEXT NOT NULL REFERENCES source_segments(segment_id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    evidence_start INTEGER NOT NULL,
    evidence_end INTEGER NOT NULL,
    evidence_sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, term, definition, segment_id, evidence_start)
);

CREATE TABLE IF NOT EXISTS event_extraction_audit (
    audit_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES event_extraction_runs(run_id) ON DELETE CASCADE,
    segment_id TEXT NOT NULL REFERENCES source_segments(segment_id) ON DELETE CASCADE,
    disposition TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_index_jobs (
    job_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    version_id TEXT NOT NULL REFERENCES document_event_versions(version_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    requested_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(version_id)
);
CREATE INDEX IF NOT EXISTS idx_event_index_queue ON event_index_jobs(status, created_at);

ALTER TABLE document_event_versions
    ADD COLUMN IF NOT EXISTS canonicalization_ms DOUBLE PRECISION NOT NULL DEFAULT 0;

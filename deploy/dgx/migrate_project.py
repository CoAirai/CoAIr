"""Project-scoped, resumable device migration; source mounts must be read-only.

Developer tool, not an application endpoint. Run through its host coordinator.
Never copies accounts, passwords, organization policy or payment/billing stores.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
from datetime import datetime, timezone

PROJECT = '9526e46f951947d1'
SOURCE = Path('/source')
TARGET = Path('/app')


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else (default if default is not None else {})


def scoped_records(registry, project):
    rows = {k: v for k, v in registry.items() if v.get('project_id') == project}
    if not rows or any(k != v.get('doc_id') for k, v in rows.items()):
        raise ValueError('Project registry is empty or has inconsistent identifiers')
    return rows


def merge_registry(existing, incoming):
    """Resume an unpublished import without replacing another document's identity."""
    identity = ('doc_id', 'project_id', 'file_name', 'file_path', 'file_hash')
    for key in set(existing) & set(incoming):
        if any(existing[key].get(field) != incoming[key].get(field) for field in identity):
            raise ValueError('Registry identifier collision')
    return {**existing, **incoming}


def mapped_path(original, source=SOURCE, target=TARGET):
    path = Path(original)
    if '..' in path.parts or not path.is_absolute():
        raise ValueError('Unsafe original path')
    relative = path.relative_to('/app')
    if not relative.parts or relative.parts[0] not in ('storage', 'data'):
        raise ValueError('Only application data/storage paths can be copied')
    old, new = source / relative, target / relative
    if not old.resolve().is_relative_to(source.resolve()):
        raise ValueError('Source path escapes read-only data mounts')
    return old, new


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.digest()


def ensure_parent(path):
    missing = []
    parent = path.parent
    while not parent.exists():
        missing.append(parent); parent = parent.parent
    for item in reversed(missing):
        item.mkdir(); os.chown(item, 1000, 1000)


def copy_file(old, new):
    if old.is_symlink() or not old.is_file():
        raise ValueError('Original is missing or is a symbolic link')
    digest = sha(old)
    if new.exists():
        if not new.is_file() or sha(new) != digest:
            raise ValueError('Destination differs; refusing to overwrite: ' + str(new))
        return
    ensure_parent(new)
    temporary = new.with_name(new.name + '.importing')
    shutil.copyfile(old, temporary)
    if sha(temporary) != digest:
        raise ValueError('Copy integrity mismatch')
    os.chown(temporary, 1000, 1000)
    temporary.replace(new)


def copy_tree(old, new):
    if not old.exists(): return 0
    count = 0
    for path in old.rglob('*'):
        if path.is_symlink(): raise ValueError('Symbolic link in project tree')
        if path.is_file():
            copy_file(path, new / path.relative_to(old)); count += 1
    return count


def atomic_json(path, value):
    ensure_parent(path)
    temporary = path.with_name(path.name + '.importing')
    temporary.write_text(json.dumps(value, ensure_ascii=False))
    os.chown(temporary, 1000, 1000); temporary.replace(path)


def vectors(settings, records):
    import httpx
    source = settings['source_env']; target = settings['target_env']
    collection = target.get('QDRANT_COLLECTION', 'constructioniq')
    if collection != source.get('QDRANT_COLLECTION', 'constructioniq'):
        raise ValueError('Collection names differ')
    if any(source.get(k) != target.get(k) for k in ('EMBEDDING_API_URL', 'EMBEDDING_API_KEY')):
        raise ValueError('Embedding services differ; re-embedding must be qualified separately')
    with httpx.Client(timeout=120, trust_env=False) as client:
        def call(env, suffix, payload=None, method='POST'):
            url = env['QDRANT_URL'].rstrip('/') + '/collections/' + collection + suffix
            r = client.request(method, url, headers={'api-key': env['QDRANT_API_KEY']}, json=payload)
            r.raise_for_status(); return r.json()['result']
        old = call(source, '', method='GET')['config']['params']['vectors']
        new = call(target, '', method='GET')['config']['params']['vectors']
        if old != new: raise ValueError('Vector configurations differ')
        scope = {'must': [{'key': 'project_id', 'match': {'value': PROJECT}}]}
        expected = call(source, '/points/count', {'filter': scope, 'exact': True})['count']
        if not expected: raise ValueError('Source project has no vectors')
        offset = None; copied = 0; page_stats = {}
        names = {r['file_name'] for r in records.values()}
        while True:
            body = {'filter': scope, 'limit': 128, 'with_payload': True, 'with_vector': True}
            if offset is not None: body['offset'] = offset
            batch = call(source, '/points/scroll', body)
            points = batch['points']
            for point in points:
                payload = point['payload']
                if payload.get('project_id') != PROJECT or payload.get('file_name') not in names:
                    raise ValueError('Vector scope does not match approved project sources')
                name = payload['file_name']; page = int(payload.get('page_number') or 0)
                stats = page_stats.setdefault(name, {'pages': set(), 'ocr': set()})
                if page:
                    stats['pages'].add(page)
                    if payload.get('extraction_method') in ('ocr', 'native+ocr'): stats['ocr'].add(page)
            if points:
                # Scroll metadata is not part of the point-upsert schema.
                writable = [{k: p[k] for k in ('id', 'vector', 'payload')} for p in points]
                call(target, '/points?wait=true', {'points': writable}, method='PUT')
                copied += len(points)
            offset = batch.get('next_page_offset')
            if offset is None: break
        actual = call(target, '/points/count', {'filter': scope, 'exact': True})['count']
        if actual != expected or copied != expected: raise ValueError('Vector count mismatch')
    return {'vectors': actual, 'page_stats': {k: {'total_pages': len(v['pages']), 'ocr_pages': len(v['ocr'])}
                                            for k, v in page_stats.items()}}


def files(records):
    for record in records.values():
        old, new = mapped_path(record['file_path']); copy_file(old, new)
    auxiliary = 0
    for parent in ('storage/projects', 'storage/canonical_events', 'storage/document_metadata', 'data/projects'):
        auxiliary += copy_tree(SOURCE / parent / PROJECT, TARGET / parent / PROJECT)
    # Document-keyed metadata is scoped by the approved registry, never filename alone.
    for identifier in records:
        for parent in ('data/notices', 'storage/enrichment', 'storage/ocr_audits'):
            old = SOURCE / parent / (identifier + '.json')
            if old.exists(): copy_file(old, TARGET / parent / old.name); auxiliary += 1
    catalog = read_json(SOURCE / 'storage/parquet/catalog.json')
    selected = {k: v for k, v in catalog.items() if v.get('project_id') == PROJECT}
    for entry in selected.values():
        for table in entry.get('tables', []):
            if table.get('project_id') != PROJECT: raise ValueError('Table project scope differs')
            old, new = mapped_path(table['parquet_path']); copy_file(old, new)
        if entry.get('notice_path'):
            old, new = mapped_path(entry['notice_path'])
            if old.exists(): copy_file(old, new)
    return {'originals': len(records), 'auxiliary_files': auxiliary, 'catalog_entries': selected}


def merge_chunk_database(source_db, target_db, project):
    import duckdb
    db = duckdb.connect(str(target_db))
    db.execute("ATTACH '" + str(source_db).replace("'", "''") + "' AS previous (READ_ONLY)")
    migrated = {}
    try:
        db.execute('BEGIN')
        for table in ('chunks', 'document_index'):
            old_columns = {r[1] for r in db.execute('PRAGMA table_info(\'previous.' + table + '\')').fetchall()}
            columns = [r[1] for r in db.execute('PRAGMA table_info(\'' + table + '\')').fetchall()]
            if set(columns) != old_columns: raise ValueError('DuckDB schema differs: ' + table)
            # Repeating a failed unpublished import may add identical rows only.
            sql_columns = ','.join('"' + c.replace('"','""') + '"' for c in columns)
            db.execute('INSERT INTO ' + table + '(' + sql_columns + ') SELECT ' + sql_columns + ' FROM previous.' + table + ' WHERE project_id=? ON CONFLICT DO NOTHING', [project])
            migrated[table] = db.execute('SELECT COUNT(*) FROM ' + table + ' WHERE project_id=?', [project]).fetchone()[0]
            expected = db.execute('SELECT COUNT(*) FROM previous.' + table + ' WHERE project_id=?', [project]).fetchone()[0]
            mismatch = db.execute('SELECT COUNT(*) FROM (SELECT '+sql_columns+' FROM '+table+' WHERE project_id=? EXCEPT SELECT '+sql_columns+' FROM previous.'+table+' WHERE project_id=?)', [project, project]).fetchone()[0]
            if migrated[table] != expected or mismatch: raise ValueError('Copied search rows differ from source')
        if not migrated['chunks'] or not migrated['document_index']: raise ValueError('Missing source search tier')
        db.execute("INSERT OR REPLACE INTO chunk_store_meta VALUES ('fts_dirty','1')")
        db.execute('COMMIT'); db.execute('CHECKPOINT')
    except BaseException:
        try: db.execute('ROLLBACK')
        except Exception: pass
        raise
    finally: db.close()
    return migrated


def copy_legacy_timeline(records):
    import duckdb
    old = SOURCE / 'storage/events/events.db'
    if not old.exists(): return 0
    new = TARGET / 'storage/events/events.db'
    ensure_parent(new)
    db = duckdb.connect(str(new))
    try:
        db.execute("ATTACH '" + str(old).replace("'", "''") + "' AS previous (READ_ONLY)")
        if not db.execute("SELECT 1 FROM information_schema.tables WHERE table_catalog <> 'previous' AND table_name='events'").fetchone():
            ddl = db.execute("SELECT sql FROM duckdb_tables() WHERE database_name='previous' AND table_name='events'").fetchone()[0]
            db.execute(ddl)
        columns = [r[1] for r in db.execute("PRAGMA table_info('events')").fetchall()]
        names = ','.join('"'+c+'"' for c in columns)
        select = ','.join('? AS "project"' if c == 'project' else '"'+c+'"' for c in columns)
        db.execute('BEGIN')
        db.execute('INSERT INTO events('+names+') SELECT '+select+' FROM previous.events WHERE doc_id IN (SELECT unnest(?)) ON CONFLICT DO NOTHING', [PROJECT,list(records)])
        count = db.execute('SELECT COUNT(*) FROM events WHERE project=?', [PROJECT]).fetchone()[0]
        db.execute('COMMIT');db.execute('CHECKPOINT')
        return count
    finally: db.close();os.chown(new,1000,1000)


def copy_event_memory(settings):
    import psycopg
    from psycopg import sql
    from psycopg.types.json import Jsonb
    source_url = settings['source_env'].get('EVENT_DATABASE_URL') or settings['source_env']['DATABASE_URL']
    target_url = settings['target_env'].get('EVENT_DATABASE_URL') or settings['target_env']['DATABASE_URL']
    scoped = 'project_id=%s'
    plans = [
        ('document_event_versions', scoped), ('source_segments', scoped),
        ('event_extraction_runs', scoped), ('event_clusters', scoped),
        ('event_observations', scoped), ('event_cluster_relations', scoped),
        ('event_cluster_members', 'cluster_id IN (SELECT cluster_id FROM event_clusters WHERE project_id=%s)'),
        ('event_dates', 'observation_id IN (SELECT observation_id FROM event_observations WHERE project_id=%s)'),
        ('event_jargon_resolutions', 'observation_id IN (SELECT observation_id FROM event_observations WHERE project_id=%s)'),
        ('project_jargon_candidates', scoped), ('event_index_jobs', scoped),
    ]
    counts = {}
    with psycopg.connect(source_url) as old, psycopg.connect(target_url) as new:
        old.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        for table, condition in plans:
            query = sql.SQL('SELECT * FROM {} WHERE ' + condition).format(sql.Identifier(table))
            with old.cursor() as cur:
                cur.execute(query, (PROJECT,))
                names = [column.name for column in cur.description]
                json_columns = {i for i, column in enumerate(cur.description) if column.type_code in (114, 3802)}
                insert = sql.SQL('INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING').format(
                    sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, names)),
                    sql.SQL(',').join(sql.Placeholder() for _ in names))
                count = 0
                while True:
                    batch = cur.fetchmany(200)
                    if not batch: break
                    adapted = [tuple(Jsonb(value) if i in json_columns and value is not None else value
                                     for i, value in enumerate(row)) for row in batch]
                    with new.cursor() as destination:
                        destination.executemany(insert, adapted)
                    count += len(batch)
                actual = new.execute(sql.SQL('SELECT COUNT(*) FROM {} WHERE ' + condition).format(sql.Identifier(table)), (PROJECT,)).fetchone()[0]
                if actual != count: raise ValueError('Event-memory row count mismatch: ' + table)
                counts[table] = count
        new.commit()
    return counts


def finalize(settings, records, state):
    # Both API writers must be stopped by the coordinator before this phase.
    for record in records.values():
        old, new = mapped_path(record['file_path'])
        if not new.is_file() or sha(old) != sha(new): raise ValueError('Original changed during import')
    migrated = merge_chunk_database(SOURCE / 'storage/chunks/chunks.db', TARGET / 'storage/chunks/chunks.db', PROJECT)
    legacy_events = copy_legacy_timeline(records)
    old = sqlite3.connect('file:' + str(SOURCE / 'storage/document_reviews.db') + '?mode=ro', uri=True)
    new = sqlite3.connect(str(TARGET / 'storage/document_reviews.db'))
    try:
        rows = old.execute('SELECT project,file,version,payload,author,created_at FROM reviews WHERE project=?', (PROJECT,))
        count = 0
        for row in rows:
            row = list(row)
            if row[2] == 0:
                payload = json.loads(row[3]); record = records.get(row[1])
                stats = state['page_stats'].get(record['file_name']) if record else None
                if stats:
                    payload.setdefault('extraction', {}).update(stats)
                    row[3] = json.dumps(payload, ensure_ascii=False)
            existing = new.execute('SELECT project,file,version,payload,author,created_at FROM reviews WHERE project=? AND file=? AND version=?', row[:3]).fetchone()
            if existing and tuple(row) != existing: raise ValueError('Review revision collision')
            if not existing: new.execute('INSERT INTO reviews(project,file,version,payload,author,created_at) VALUES (?,?,?,?,?,?)', row)
            count += 1
        new.commit()
    finally: old.close(); new.close()
    registry = read_json(TARGET / 'storage/document_registry.json')
    atomic_json(TARGET / 'storage/document_registry.json', merge_registry(registry, records))
    catalog = read_json(TARGET / 'storage/parquet/catalog.json')
    if any(catalog[k] != state['catalog_entries'][k] for k in set(catalog) & set(state['catalog_entries'])): raise ValueError('Catalog identifier collision')
    catalog.update(state['catalog_entries']); atomic_json(TARGET / 'storage/parquet/catalog.json', catalog)
    # Application stores use PostgreSQL only; no customer accounts/billing data are imported.
    os.environ.update(settings['target_env'])
    sys.path.insert(0, '/app')
    import coair_protected
    coair_protected.activate()
    from src.project_store import get_project_store
    from src.org_store import get_org_store
    from src.master_event_store import get_master_event_store
    get_master_event_store()
    event_counts = copy_event_memory(settings)
    projects = get_project_store(); owner = settings['owner']
    membership = get_org_store().membership_for(owner)
    if not membership or membership['role'] != 'owner': raise ValueError('Target account is not a company owner')
    existing = projects.get(PROJECT)
    if existing and (existing['created_by'] != owner or existing['org_id'] != membership['org_id']): raise ValueError('Target project ownership collision')
    now = datetime.now(timezone.utc).isoformat()
    with projects._connect() as connection:
        connection.execute('INSERT INTO projects(project_id,name,slug,embedding_profile,created_by,created_at,updated_at,archived_at,org_id) VALUES (?,?,?,?,?,?,?,NULL,?) ON CONFLICT(project_id) DO NOTHING',
                           [PROJECT,'Edinburgh Test','edinburgh-test','local-bge-v1',owner,now,now,membership['org_id']])
        connection.execute('INSERT INTO project_members(project_id,username,role,created_at) VALUES (?,?,?,?) ON CONFLICT(project_id,username) DO NOTHING', [PROJECT,owner,'owner',now])
    projects.set_vector_state(PROJECT,'ready',point_count=state['vectors'])
    return {**migrated, 'review_versions': count, 'event_memory': event_counts, 'legacy_timeline_events': legacy_events, 'published_project': PROJECT}


def main():
    settings = json.load(sys.stdin)
    records = scoped_records(read_json(SOURCE / 'storage/document_registry.json'), PROJECT)
    phase = sys.argv[1]
    if phase == 'files': result = files(records)
    elif phase == 'vectors': result = vectors(settings, records)
    elif phase == 'finalize': result = finalize(settings, records, settings['state'])
    else: raise ValueError('Unknown migration phase')
    print('MIGRATION_RESULT=' + json.dumps(result))


if __name__ == '__main__': main()

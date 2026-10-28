"""Portable, project-scoped agent corpus transfer across DuckDB versions.

Transfers evidence and document search metadata only. User, organization,
payment and vector databases are excluded. Import requires a new destination.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

import duckdb


TABLES = ('chunks', 'document_index')


def _digest(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


def export_corpus(database, project_id, output):
    if not project_id.strip():
        raise ValueError('project_id_required')
    tables = {}
    with duckdb.connect(str(database), read_only=True) as db:
        for table in TABLES:
            if not db.execute('SELECT 1 FROM information_schema.tables WHERE table_name=?', [table]).fetchone():
                continue
            schema = db.execute(f"PRAGMA table_info('{table}')").fetchall()
            if 'project_id' not in {row[1] for row in schema}:
                raise ValueError('unscoped_source_table')
            rows = db.execute(f'SELECT * FROM {table} WHERE project_id=? ORDER BY 1', [project_id]).fetchall()
            tables[table] = {'columns': [{'name': row[1], 'type': row[2], 'primary': bool(row[5])}
                                         for row in schema], 'rows': rows}
    payload = {'version': 1, 'project_id': project_id, 'tables': tables}
    if not tables.get('chunks', {}).get('rows'):
        raise ValueError('source_project_has_no_chunks')
    envelope = {'payload': payload, 'sha256': _digest(payload)}
    # JSON distinguishes neither tuples nor lists; canonical hashing is stable.
    with Path(output).open('x', encoding='utf-8') as file:
        json.dump(envelope, file, ensure_ascii=False)
    return envelope['sha256']


def import_corpus(snapshot, database):
    destination = Path(database)
    if destination.exists():
        raise ValueError('destination_must_be_new')
    envelope = json.loads(Path(snapshot).read_text())
    payload = envelope['payload']
    if payload.get('version') != 1 or _digest(payload) != envelope['sha256']:
        raise ValueError('snapshot_integrity_failed')
    if not payload.get('project_id') or set(payload['tables']) - set(TABLES):
        raise ValueError('invalid_snapshot_scope')
    # Validate the entire payload before creating a destination file.
    for table, content in payload['tables'].items():
        columns = content['columns']
        for column in columns:
            if not re.fullmatch(r'[a-z_][a-z0-9_]*', column['name']):
                raise ValueError('invalid_snapshot_column')
            if column['type'] not in {'VARCHAR', 'INTEGER', 'BIGINT', 'BOOLEAN', 'DOUBLE', 'FLOAT'}:
                raise ValueError('unsupported_snapshot_column_type')
        project_column = [column['name'] for column in columns].index('project_id')
        if any(len(row) != len(columns) or row[project_column] != payload['project_id']
               for row in content['rows']):
            raise ValueError('snapshot_project_mismatch')
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with duckdb.connect(str(destination)) as db:
            db.execute('BEGIN')
            for table, content in payload['tables'].items():
                columns = content['columns']
                definitions = ','.join('"' + col['name'] + '" ' + col['type'] +
                                       (' PRIMARY KEY' if col['primary'] else '') for col in columns)
                db.execute(f'CREATE TABLE {table} ({definitions})')
                if content['rows']:
                    marks = ','.join('?' for _ in columns)
                    db.executemany(f'INSERT INTO {table} VALUES ({marks})', content['rows'])
            db.execute('COMMIT')
        # The native ChunkStore recreates indexes and the FTS dirty flag on open.
        return envelope['sha256']
    except Exception:
        destination.unlink(missing_ok=True)
        Path(str(destination) + '.wal').unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    export = commands.add_parser('export')
    export.add_argument('--database', required=True)
    export.add_argument('--project', required=True)
    export.add_argument('--output', required=True)
    restore = commands.add_parser('import')
    restore.add_argument('--snapshot', required=True)
    restore.add_argument('--database', required=True)
    args = parser.parse_args()
    if args.command == 'export':
        print(export_corpus(args.database, args.project, args.output))
    else:
        print(import_corpus(args.snapshot, args.database))

"""Read-only file inventory and comparison, never a database backup/copy tool."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile

SCHEMA = 1
MUTABLE = {'.db', '.sqlite', '.sqlite3', '.duckdb', '.wal', '.shm'}
EXCLUDED = {'.state-owner.lock', '.env', '.env.production', 'access.json', 'api.env'}


def digest(path):
    result = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    after = path.stat()
    if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
        raise ValueError('Source changed while hashing; retry from a stable source')
    return after.st_size, result.hexdigest()


def inventory(root):
    root = Path(root).resolve(strict=True)
    if not root.is_dir():
        raise ValueError('Source root must be a directory')
    files = []
    for name in ('data', 'storage', 'qdrant_snapshots'):
        start = root / name
        if start.is_symlink():
            raise ValueError('Symlink roots are not supported')
        if not start.exists():
            continue
        for directory, dirs, names in os.walk(start, followlinks=False):
            for entry in dirs + names:
                if (Path(directory) / entry).is_symlink():
                    raise ValueError('Symlinks must be resolved explicitly before migration')
            dirs[:] = sorted(d for d in dirs if d not in ('secrets', 'provider-keys', '__pycache__'))
            for entry in sorted(names):
                path = Path(directory) / entry
                if not path.is_file() or entry in EXCLUDED or entry.startswith('.env') or path.suffix in ('.pem', '.key', '.p12'):
                    continue
                mutable = path.suffix in MUTABLE or entry.endswith(('-wal', '-shm', '-journal'))
                if mutable:
                    # Hashing a live database is not a consistent backup. Make the
                    # missing backup explicit without opening a second DB writer.
                    files.append({'path': path.relative_to(root).as_posix(), 'kind': 'mutable_state', 'size': path.stat().st_size})
                else:
                    size, sha = digest(path)
                    files.append({'path': path.relative_to(root).as_posix(), 'kind': 'asset', 'size': size, 'sha256': sha})
    files.sort(key=lambda row: row['path'])
    if not files:
        raise ValueError('No application files found; refusing an empty migration inventory')
    registry = root / 'storage/document_registry.json'
    identity = None
    if registry.is_file():
        rows = json.loads(registry.read_text())
        if not isinstance(rows, dict):
            raise ValueError('Expected registry keyed by document ID')
        identities = sorted((key, row.get('doc_id'), row.get('project_id'), row.get('file_hash'), row.get('file_name')) for key, row in rows.items())
        identity = {'records': len(rows), 'without_project_id': sum(not r.get('project_id') for r in rows.values()),
                    'sha256': hashlib.sha256(json.dumps(identities, sort_keys=True).encode()).hexdigest()}
    return {'schema': SCHEMA, 'files': files, 'registry_identity': identity,
            'consistent_state_backup_verified': False,
            'notes': ['Asset hashes are not proof of a consistent database backup.',
                      'Live Qdrant storage is excluded; export a supported snapshot separately.',
                      'Vector model/dimensions, tenant ownership and relational stores require separate acceptance.']}


def index(manifest):
    if manifest.get('schema') != SCHEMA or not isinstance(manifest.get('files'), list) or not manifest['files']:
        raise ValueError('Unsupported or empty inventory')
    result = {}
    for row in manifest['files']:
        raw = row.get('path', '')
        path = PurePosixPath(raw)
        if not raw or path.is_absolute() or '..' in path.parts or '\\' in raw or str(path) != raw or path.parts[0] not in ('data', 'storage', 'qdrant_snapshots') or raw in result:
            raise ValueError('Invalid or duplicate inventory path')
        if row.get('kind') not in ('asset', 'mutable_state') or not isinstance(row.get('size'), int) or row['size'] < 0:
            raise ValueError('Invalid inventory entry')
        if row['kind'] == 'asset' and (len(row.get('sha256', '')) != 64 or any(c not in '0123456789abcdef' for c in row['sha256'])):
            raise ValueError('Asset SHA-256 is required')
        result[raw] = row
    return result


def compare(source, destination):
    first, second = index(source), index(destination)
    missing, extra = sorted(first.keys() - second.keys()), sorted(second.keys() - first.keys())
    changed = sorted(name for name in first.keys() & second.keys() if first[name] != second[name])
    identity_match = source.get('registry_identity') == destination.get('registry_identity')
    mutable = sorted(name for name, row in first.items() if row['kind'] == 'mutable_state')
    return {'asset_inventory_matches': not (missing or extra or changed) and identity_match,
            'missing': missing, 'extra': extra, 'changed': changed, 'registry_identity_matches': identity_match,
            'mutable_state_requires_separate_backup': mutable, 'migration_accepted': False}


def write_report(path, data):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix='.migration-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, indent=2)
        os.replace(temporary, path)  # mkstemp retains owner-only permissions.
    finally:
        Path(temporary).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    inv = sub.add_parser('inventory'); inv.add_argument('root'); inv.add_argument('--output', required=True)
    diff = sub.add_parser('compare'); diff.add_argument('source'); diff.add_argument('destination'); diff.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'inventory':
            root, output = Path(args.root).resolve(), Path(args.output).resolve()
            if output == root or root in output.parents:
                raise ValueError('Write inventories outside the application root')
            data = inventory(root)
        else:
            with open(args.source) as a, open(args.destination) as b:
                data = compare(json.load(a), json.load(b))
        write_report(args.output, data)
        print(json.dumps({'report_written': True, 'migration_accepted': False}))
        return 0 if args.command == 'inventory' or data['asset_inventory_matches'] else 1
    except (OSError, ValueError) as exc:
        print(json.dumps({'report_written': False, 'error': str(exc)}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

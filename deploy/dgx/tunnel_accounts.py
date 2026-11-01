"""Root-only, key-only SSH forwarding accounts. Never enables a user shell."""
import argparse
import base64
import fcntl
import json
import os
import re
import secrets
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

STATE = Path('/etc/coair/tunnel-accounts.json')
KEYS = Path('/etc/coair/tunnel-keys')
GROUP = 'coair-tunnel'


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs)


def revoke(name):
    (KEYS / name).unlink(missing_ok=True)
    run('usermod', '--expiredate', '1970-01-02', name)
    subprocess.run(['pkill', '-u', name], check=False, capture_output=True)


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run as the device operator (root).')
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='action', required=True)
    add = sub.add_parser('add')
    add.add_argument('--name', required=True)
    add.add_argument('--app-user', required=True)
    add.add_argument('--public-key', type=Path, required=True)
    add.add_argument('--expires-at', required=True)
    add.add_argument('--database-container', default='coair-demo-db-1')
    remove = sub.add_parser('revoke')
    remove.add_argument('--name', required=True)
    sub.add_parser('expire')
    args = parser.parse_args()
    STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    STATE.parent.chmod(0o755)
    lock = STATE.with_suffix('.lock').open('a')
    os.chmod(lock.name, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX)
    records = json.loads(STATE.read_text()) if STATE.exists() else {}
    def app_records(container):
        if not re.fullmatch(r'[a-zA-Z0-9_.-]+', container):
            raise ValueError('Invalid managed database container')
        sql = "SELECT COALESCE(json_agg(json_build_object('username',u.username,'role',u.role,'active',u.is_active=1 AND u.account_status='active' AND o.archived_at IS NULL AND m.org_id IS NOT NULL,'expires_at',u.expires_at,'org_id',m.org_id)), '[]'::json) FROM users u LEFT JOIN org_members m ON m.username=u.username LEFT JOIN organizations o ON o.org_id=m.org_id"
        data = run('docker', 'exec', container, 'psql', '-U', 'coair', '-d', 'coair', '-Atc', sql).stdout
        return {row['username']: row for row in json.loads(data)}
    if args.action == 'expire':
        cached = {}
        for name, item in records.items():
            if item.get('revoked'):
                continue
            source = item['database_container']
            if source not in cached:
                try:
                    cached[source] = app_records(source)
                except Exception:
                    cached[source] = {}  # Fail closed if application state cannot be verified.
            app = cached[source].get(item['app_user'])
            unavailable = not app or not app['active'] or app['org_id'] != item['org_id']
            app_expired = bool(app and app['expires_at'] and datetime.fromisoformat(app['expires_at']) <= datetime.now(timezone.utc))
            if unavailable or app_expired or datetime.fromisoformat(item['expires_at']) <= datetime.now(timezone.utc):
                revoke(name)
                item['revoked'] = True
    else:
        if not re.fullmatch(r'tunnel-[a-z][a-z0-9-]{0,24}', args.name):
            raise SystemExit('Invalid tunnel account name.')
        if args.action == 'revoke':
            if args.name not in records:
                raise SystemExit('Unknown managed tunnel account.')
            revoke(args.name)
            records[args.name]['revoked'] = True
        else:
            deadline = datetime.fromisoformat(args.expires_at.replace('Z', '+00:00'))
            if deadline.tzinfo is None or deadline <= datetime.now(timezone.utc):
                raise SystemExit('A future timezone-aware deadline is required.')
            app = app_records(args.database_container).get(args.app_user)
            if not app or not app['active'] or app['role'] != 'user':
                raise SystemExit('An active company application account is required.')
            if app['expires_at'] and deadline > datetime.fromisoformat(app['expires_at']):
                raise SystemExit('Tunnel expiry cannot exceed application expiry.')
            key = args.public_key.read_text().strip()
            pieces = key.split()
            if len(key.splitlines()) != 1 or len(pieces) < 2 or pieces[0] not in ('ssh-ed25519', 'ssh-rsa'):
                raise SystemExit('Supply a plain OpenSSH public key, without key options.')
            base64.b64decode(pieces[1], validate=True)
            key = ' '.join(pieces[:2])
            fingerprint = run('ssh-keygen', '-l', '-f', str(args.public_key)).stdout.strip()
            if subprocess.run(['getent', 'group', GROUP], capture_output=True).returncode:
                run('groupadd', '--system', GROUP)
            existing = subprocess.run(['id', args.name], capture_output=True)
            if existing.returncode == 0 and args.name not in records:
                raise SystemExit('Refusing to reuse an unmanaged Linux account.')
            if existing.returncode:
                hashed = run('openssl', 'passwd', '-6', '-stdin', input=secrets.token_urlsafe(48)).stdout.strip()
                run('useradd', '--no-create-home', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin',
                    '--gid', GROUP, '--password', hashed, args.name)
            # Linux expiry is midnight: exact expiration is enforced by the timer.
            linux_deadline = deadline.astimezone(timezone.utc).date() + timedelta(days=1)
            run('usermod', '--expiredate', linux_deadline.isoformat(), args.name)
            # sshd reads AuthorizedKeysFile while using the target UID.
            # Public keys are readable; only root can change them or lifecycle state.
            KEYS.mkdir(parents=True, exist_ok=True, mode=0o755)
            KEYS.chmod(0o755)
            (KEYS / args.name).write_text(key + '\n')
            (KEYS / args.name).chmod(0o644)
            records[args.name] = {'app_user': args.app_user, 'expires_at': deadline.astimezone(timezone.utc).isoformat(),
                                  'database_container': args.database_container, 'org_id': app['org_id'],
                                  'fingerprint': fingerprint, 'revoked': False}
    STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = STATE.with_suffix('.tmp')
    temp.write_text(json.dumps(records, indent=2) + '\n')
    temp.chmod(0o600)
    temp.replace(STATE)


if __name__ == '__main__':
    main()

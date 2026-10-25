"""Atomic local token reservations, shared by all workers in the database."""
import uuid
from datetime import datetime, timezone
from .database import connect
from .user_store import UserQuotaExceededError, account_expired
from .appliance_access import PLANS

SCHEMA = """
CREATE TABLE IF NOT EXISTS appliance_token_usage (
 username TEXT NOT NULL, period TEXT NOT NULL,
 used BIGINT NOT NULL DEFAULT 0, reserved BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(username, period)
);
CREATE TABLE IF NOT EXISTS appliance_token_reservations (
 reservation_id TEXT PRIMARY KEY, username TEXT NOT NULL, period TEXT NOT NULL,
 amount BIGINT NOT NULL, created_at TEXT NOT NULL
);
"""


def period_for(record):
    return datetime.now(timezone.utc).date().isoformat() if record['access_plan'] == 'office' else 'demo'


def snapshot(store, record):
    with connect(store.db_path) as conn:
        conn.executescript(SCHEMA)
        row = conn.execute('SELECT used,reserved FROM appliance_token_usage WHERE username=? AND period=?',
                           [record['username'], period_for(record)]).fetchone()
    return {'used': int(row['used']) if row else 0,
            'reserved': int(row['reserved']) if row else 0,
            'limit': PLANS[record['access_plan']]}


def reserve(store, username, amount):
    record = store.get_user(username)
    if not record or not record.get('access_plan'):
        return None
    if account_expired(record) or not record['is_active'] or record['must_change_password']:
        raise PermissionError('account_access_unavailable')
    amount = max(0, int(amount))
    limit = PLANS[record['access_plan']]
    period = period_for(record)
    identifier = uuid.uuid4().hex
    with connect(store.db_path) as conn:
        conn.executescript(SCHEMA)
        conn.execute('BEGIN IMMEDIATE')
        conn.execute('INSERT INTO appliance_token_usage(username,period) VALUES (?,?) ON CONFLICT(username,period) DO NOTHING',
                     [username, period])
        cursor = conn.execute('UPDATE appliance_token_usage SET reserved=reserved+? WHERE username=? AND period=? AND used+reserved+?<=?',
                              [amount, username, period, amount, limit])
        if cursor.rowcount != 1:
            row = conn.execute('SELECT used,reserved FROM appliance_token_usage WHERE username=? AND period=?', [username, period]).fetchone()
            raise UserQuotaExceededError(username, int(row['used']) + int(row['reserved']), limit)
        conn.execute('INSERT INTO appliance_token_reservations VALUES (?,?,?,?,?)',
                     [identifier, username, period, amount, datetime.now(timezone.utc).isoformat()])
    return identifier


def settle(store, identifier, actual_tokens):
    if not identifier:
        return
    # A timed-out provider may still be generating. Leave the reservation held
    # rather than inventing actual token usage or allowing quota evasion.
    if actual_tokens is None:
        return
    with connect(store.db_path) as conn:
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT * FROM appliance_token_reservations WHERE reservation_id=?', [identifier]).fetchone()
        if not row:
            return
        deleted = conn.execute('DELETE FROM appliance_token_reservations WHERE reservation_id=?', [identifier])
        if deleted.rowcount != 1:
            return
        conn.execute('UPDATE appliance_token_usage SET reserved=reserved-?,used=used+? WHERE username=? AND period=?',
                     [row['amount'], max(0, int(actual_tokens)), row['username'], row['period']])

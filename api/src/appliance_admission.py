"""Cross-process chat admission on a shared, small SQLite lease database."""
import asyncio
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def database():
    from .config import STORAGE_DIR
    path = Path(os.getenv('COAIR_ADMISSION_DATABASE', str(Path(STORAGE_DIR) / 'admission.db')))
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('CREATE TABLE IF NOT EXISTS chat_leases (id TEXT PRIMARY KEY, identity TEXT NOT NULL, created REAL NOT NULL, expires REAL NOT NULL, active INTEGER NOT NULL DEFAULT 0)')
        conn.commit()
        conn.execute('BEGIN IMMEDIATE')
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


class ChatLease:
    def __init__(self, identity):
        self.identity = identity
        self.identifier = uuid.uuid4().hex
        self.heartbeat = None

    def try_acquire(self):
        now = time.time()
        with database() as conn:
            conn.execute('DELETE FROM chat_leases WHERE expires<?', [now])
            conn.execute('INSERT INTO chat_leases(id,identity,created,expires) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires',
                         [self.identifier, self.identity, now, now + 90])
            if conn.execute('SELECT COUNT(*) FROM chat_leases WHERE active=1').fetchone()[0] >= 3:
                return False
            eligible = conn.execute('SELECT id FROM chat_leases q WHERE active=0 AND NOT EXISTS (SELECT 1 FROM chat_leases a WHERE a.active=1 AND a.identity=q.identity) ORDER BY created,id LIMIT 1').fetchone()
            if not eligible or eligible['id'] != self.identifier:
                return False
            conn.execute('UPDATE chat_leases SET active=1 WHERE id=?', [self.identifier])
            return True

    async def renew(self):
        while True:
            await asyncio.sleep(20)
            with database() as conn:
                conn.execute('UPDATE chat_leases SET expires=? WHERE id=?', [time.time() + 90, self.identifier])

    async def __aenter__(self):
        try:
            while not await asyncio.to_thread(self.try_acquire):
                await asyncio.sleep(0.25)
            self.heartbeat = asyncio.create_task(self.renew())
            return self
        except BaseException:
            self.release()
            raise

    def release(self):
        with database() as conn:
            conn.execute('DELETE FROM chat_leases WHERE id=?', [self.identifier])

    async def __aexit__(self, *args):
        if self.heartbeat:
            self.heartbeat.cancel()
            try:
                await self.heartbeat
            except asyncio.CancelledError:
                pass
        self.release()

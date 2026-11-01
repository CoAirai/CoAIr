"""Local, versioned OCR/metadata corrections. Original files are never edited."""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from .config import STORAGE_DIR

FIELDS = ('date', 'sender', 'recipient', 'subject', 'doc_type', 'title', 'summary', 'people', 'organizations')


class ReviewStore:
    def __init__(self, path=None):
        self.path = Path(path or Path(STORAGE_DIR) / 'document_reviews.db')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS reviews (project TEXT, file TEXT, version INTEGER, '
                       'payload TEXT, author TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, '
                       'PRIMARY KEY(project,file,version))')

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=20)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def get(self, project, file):
        with self.connect() as db:
            row = db.execute('SELECT version,payload,author,created_at FROM reviews '
                             'WHERE project=? AND file=? ORDER BY version DESC LIMIT 1', (project,file)).fetchone()
        if not row:
            return None
        return dict(json.loads(row[1]), version=row[0], author=row[2], updated_at=row[3])

    def baseline(self, project, file, pages, metadata, extraction=None):
        payload = json.dumps({'pages': {str(k): v for k,v in pages.items()},
                              'metadata': {k: ('\n'.join(metadata[k]) if isinstance(metadata.get(k), list) else metadata.get(k) or '') for k in FIELDS}, 'extraction': extraction or {}})
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO reviews(project,file,version,payload,author) VALUES (?,?,0,?,?)',
                       (project,file,payload,'extraction'))

    def save(self, project, file, version, pages, metadata, author):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT version,payload FROM reviews WHERE project=? AND file=? '
                             'ORDER BY version DESC LIMIT 1', (project,file)).fetchone()
            if not row or row[0] != version:
                raise ValueError('review_version_conflict')
            if set(pages) != set(json.loads(row[1])['pages']):
                raise ValueError('page_numbers_must_be_preserved')
            db.execute('INSERT INTO reviews(project,file,version,payload,author) VALUES (?,?,?,?,?)',
                       (project,file,version+1,json.dumps({'pages':pages,'metadata':metadata,'extraction':json.loads(row[1]).get('extraction',{})}),author))
        return self.get(project,file)

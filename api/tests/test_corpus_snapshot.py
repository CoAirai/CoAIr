import json

import duckdb
import pytest

from src.corpus_snapshot import export_corpus, import_corpus


def test_transfer_preserves_ids_text_and_project_without_accounts(tmp_path):
    source, target, snapshot = (tmp_path / name for name in ('source.db', 'target.db', 'corpus.json'))
    with duckdb.connect(str(source)) as db:
        db.execute('CREATE TABLE chunks(chunk_id VARCHAR PRIMARY KEY,doc_id VARCHAR,file_name VARCHAR,page_number INTEGER,text VARCHAR,project_id VARCHAR)')
        db.execute("INSERT INTO chunks VALUES ('c1','d1','source.pdf',1,'Original £17 evidence','a'),('c2','d2','foreign.pdf',1,'Other tenant','b')")
        db.execute('CREATE TABLE users(username VARCHAR)')
        db.execute("INSERT INTO users VALUES ('never-transfer')")
    digest = export_corpus(source, 'a', snapshot)
    assert import_corpus(snapshot, target) == digest
    with duckdb.connect(str(target), read_only=True) as db:
        assert db.execute('SELECT * FROM chunks').fetchall() == [('c1', 'd1', 'source.pdf', 1, 'Original £17 evidence', 'a')]
        assert db.execute("SELECT table_name FROM information_schema.tables").fetchall() == [('chunks',)]
    with pytest.raises(ValueError, match='destination_must_be_new'):
        import_corpus(snapshot, target)


def test_corrupted_snapshot_does_not_create_destination(tmp_path):
    snapshot = tmp_path / 'corpus.json'
    snapshot.write_text(json.dumps({'payload': {'version': 1}, 'sha256': 'invalid'}))
    destination = tmp_path / 'target.db'
    with pytest.raises(ValueError, match='snapshot_integrity_failed'):
        import_corpus(snapshot, destination)
    assert not destination.exists()

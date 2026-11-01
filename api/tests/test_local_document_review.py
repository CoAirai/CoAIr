import pytest
from src.document_review import ReviewStore


def test_revisions_preserve_original_and_reject_stale_updates(tmp_path):
    store = ReviewStore(tmp_path / 'reviews.db')
    store.baseline('a','doc',{1:'OCR original'}, {'sender':'wrong'})
    updated = store.save('a','doc',0,{'1':'corrected'}, {'sender':'right'},'alice')
    assert updated['version'] == 1
    store.baseline('a','doc',{1:'rerun OCR'}, {})
    assert store.get('a','doc')['pages'] == {'1':'corrected'}
    with store.connect() as db:
        assert 'OCR original' in db.execute('SELECT payload FROM reviews WHERE version=0').fetchone()[0]
    with pytest.raises(ValueError, match='conflict'):
        store.save('a','doc',0,{'1':'stale'}, {},'bob')
    assert store.get('b','doc') is None


def test_corrections_preserve_page_citations(tmp_path):
    store = ReviewStore(tmp_path / 'reviews.db')
    store.baseline('a','doc',{1:'one',2:'two'}, {})
    with pytest.raises(ValueError, match='page_numbers'):
        store.save('a','doc',0,{'3':'moved'}, {},'alice')


def test_inbox_cannot_escape_mount(tmp_path, monkeypatch):
    from backend.api import local_documents as api
    from fastapi import HTTPException
    root=tmp_path/'inbox'; root.mkdir()
    outside=tmp_path/'secret.pdf'; outside.write_bytes(b'%PDF')
    (root/'link.pdf').symlink_to(outside)
    monkeypatch.setattr(api,'INBOX',root)
    for path in ('../secret.pdf',str(outside),'link.pdf'):
        with pytest.raises(HTTPException): api.inbox_path(path)


def test_inbox_requires_owner():
    from backend.api.local_documents import require_inbox_owner
    from types import SimpleNamespace
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as err:
        require_inbox_owner(SimpleNamespace(role='user'), SimpleNamespace(role='editor'))
    assert err.value.status_code == 403

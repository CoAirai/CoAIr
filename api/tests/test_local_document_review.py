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


def test_extraction_counts_survive_restart_without_cross_project_metadata(tmp_path):
    path=tmp_path/'reviews.db'
    store=ReviewStore(path)
    store.baseline('a','doc',{1:'scanned text'}, {}, extraction={'total_pages':1,'ocr_pages':1})
    store.baseline('b','private',{1:'other text'}, {}, extraction={'total_pages':7,'ocr_pages':2})
    store.save('a','doc',0,{'1':'human correction'}, {}, 'alice')
    assert ReviewStore(path).extraction_stats('a') == {'doc':{'pages':1,'ocr_pages':1}}
    assert ReviewStore(path).extraction_stats('missing') == {}


def test_local_document_ingestion_creates_review_baseline(tmp_path,monkeypatch):
    from types import SimpleNamespace
    from src import config,document_rag,file_router,local_metadata,document_review
    store=ReviewStore(tmp_path/'reviews.db')
    monkeypatch.setattr(config,'LOCAL_LLM',True)
    monkeypatch.setattr(config,'INGEST_EXTRACT_NOTICES',False)
    monkeypatch.setattr(config,'INGEST_EXTRACT_TABLES',False)
    doc=SimpleNamespace(text='North Works requested access.',metadata={'file_name':'scan.pdf','page_number':1})
    rag=SimpleNamespace(add_document=lambda *a,**k:[doc],insert_documents=lambda *a,**k:True,
                        file_registry={'scan.pdf':{'ocr_pages':1}})
    monkeypatch.setattr(document_rag,'get_document_rag',lambda:rag)
    monkeypatch.setattr(document_review,'ReviewStore',lambda:store)
    monkeypatch.setattr(local_metadata,'extract_metadata_for_ingestion',lambda **k:{'title':'Access notice','status':'ready'})
    indexed=[]
    monkeypatch.setattr(file_router,'_index_document_metadata',lambda *a,**k:indexed.append(k))
    monkeypatch.setattr(file_router,'_prepare_event_artifact',lambda *a,**k:None)
    result=file_router._process_document(str(tmp_path/'scan.pdf'),project_id='project',file_id='file')
    assert result.success, result.error
    assert store.get('project','file')['pages']=={'1':'North Works requested access.'}
    assert store.extraction_stats('project')['file']=={'pages':1,'ocr_pages':1}
    assert indexed[0]['enriched']['title']=='Access notice'

"""Real chunk-mirror regressions for long report evidence and selection boundaries."""
from types import SimpleNamespace
import duckdb
import pytest
from src.ai_reports import retrieve_evidence


@pytest.fixture
def retrieval(monkeypatch):
    con = duckdb.connect(':memory:')
    con.execute('CREATE TABLE chunks(project_id VARCHAR,doc_id VARCHAR,file_name VARCHAR,page_number INTEGER,text VARCHAR,chunk_id VARCHAR)')
    hits = []
    monkeypatch.setattr('src.document_rag.get_document_rag',lambda:SimpleNamespace(query=lambda *a,**k:{'sources':hits}))
    monkeypatch.setattr('src.lexical_index.get_lexical_index',lambda:SimpleNamespace(search_chunks=lambda *a,**k:[]))
    monkeypatch.setattr('src.chunk_store.get_chunk_store',lambda:SimpleNamespace(connection=lambda:con))
    monkeypatch.setattr('src.document_registry.get_document_registry',lambda:SimpleNamespace(get=lambda key:None,get_all=lambda **kw:[]))
    yield con,hits
    con.close()


def test_a_dense_preview_does_not_hide_the_end_of_the_found_passage(retrieval):
    con,hits=retrieval
    text='Design obligations. '*250+' The final instruction was withdrawn.'
    con.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)',['p','d1','notice.pdf',40,text,'c1'])
    hits.append(dict(doc_id='d1',file_name='notice.pdf',page_number=40,text_snippet=text[:500]))
    evidence=retrieve_evidence('p',['design obligations'])
    assert any('final instruction was withdrawn' in item.excerpt for item in evidence)
    assert all(len(item.excerpt)<=3500 for item in evidence)


def test_adjacent_pages_cannot_escape_the_explicit_file_selection(retrieval):
    con,hits=retrieval
    for project,doc,page,text in [('p','chosen',1,'selected obligation'),('p','other',2,'UNSELECTED same filename'),('foreign','chosen',2,'FOREIGN obligation')]:
        con.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)',[project,doc,'same.pdf',page,text,doc+project])
    hits.append(dict(doc_id='chosen',file_name='same.pdf',page_number=1,text='selected obligation'))
    evidence=retrieve_evidence('p',['obligation'],doc_ids=['chosen'])
    assert {e.doc_id for e in evidence}=={'chosen'}
    assert not any('UNSELECTED' in e.excerpt or 'FOREIGN' in e.excerpt for e in evidence)


def test_every_found_document_can_expand_including_beyond_sixty_hits(retrieval):
    con,hits=retrieval
    for i in range(75):
        con.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)',['p',f'd{i}',f'f{i}.pdf',1,'initial passage',f'c{i}'])
        hits.append(dict(doc_id=f'd{i}',file_name=f'f{i}.pdf',page_number=1,text='initial passage'))
    con.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)',['p','d74','f74.pdf',2,'The final compensation was rejected.','tail'])
    evidence=retrieve_evidence('p',['compensation'])
    assert any('final compensation was rejected' in e.excerpt for e in evidence)

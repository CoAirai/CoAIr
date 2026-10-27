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


def test_same_source_reached_by_many_queries_is_read_once(retrieval):
    con,hits=retrieval
    con.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)',['p','d1','notice.pdf',1,'Exact original instruction.','c1'])
    hits.append(dict(doc_id='d1',file_name='notice.pdf',page_number=1,text_snippet='Exact'))
    audit={}
    evidence=retrieve_evidence('p',['instruction','instruction','notice'],stats=audit)
    assert len(evidence)==1
    assert audit['expanded_pages']==1
    assert len(audit['queries'])==4
    assert 'Exact original instruction.'==evidence[0].excerpt


def test_failed_lane_is_recorded_and_other_lane_still_returns_evidence(retrieval,monkeypatch):
    con,hits=retrieval
    def fail(*a,**k):raise TimeoutError('private provider diagnostics must not enter the ledger')
    monkeypatch.setattr('src.document_rag.get_document_rag',lambda:SimpleNamespace(query=fail))
    monkeypatch.setattr('src.lexical_index.get_lexical_index',lambda:SimpleNamespace(search_chunks=lambda *a,**k:[dict(doc_id='d1',file_name='f.pdf',page_number=1,text='Original instruction',project_id='p')]))
    audit={}
    evidence=retrieve_evidence('p',['instruction'],stats=audit)
    assert evidence
    assert audit['lane_errors']==[{'query':'instruction','lane':'dense','error_type':'TimeoutError'}]
    assert 'private' not in str(audit)


def test_legacy_fragment_alias_requires_unique_project_registry_ownership(retrieval,monkeypatch):
    con,hits=retrieval
    owned=SimpleNamespace(doc_id='canonical',project_id='p',file_name='notice.pdf')
    foreign=SimpleNamespace(doc_id='foreign',project_id='other',file_name='notice.pdf')
    legacy=SimpleNamespace(doc_id='legacy',project_id='',file_name='notice.pdf')
    registry=SimpleNamespace(get=lambda key:foreign if key=='foreign' else owned if key=='canonical' else legacy if key=='legacy' else None,get_all=lambda **kw:[owned])
    monkeypatch.setattr('src.document_registry.get_document_registry',lambda:registry)
    con.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)',['p','legacy','notice.pdf',1,'Original canonical notice.','c1'])
    hits.extend([dict(doc_id='legacy',file_name='notice.pdf',page_number=1,text_snippet='Original'),dict(doc_id='foreign',file_name='notice.pdf',page_number=1,text='FOREIGN')])
    audit={}
    evidence=retrieve_evidence('p',['notice'],doc_ids=['canonical'],stats=audit)
    assert {e.doc_id for e in evidence}=={'canonical'}
    assert not any('FOREIGN' in e.excerpt for e in evidence)
    assert audit['scope_rejections']==1
    duplicate=SimpleNamespace(doc_id='other-local',project_id='p',file_name='notice.pdf')
    registry.get_all=lambda **kw:[owned,duplicate]
    assert retrieve_evidence('p',['notice'],doc_ids=['canonical'])==[]


def test_unresolved_page_never_substitutes_page_one_as_ground_truth(retrieval):
    con,hits=retrieval
    con.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)',['p','d1','notice.pdf',1,'UNRELATED PAGE ONE','c1'])
    hits.append(dict(doc_id='d1',file_name='notice.pdf',page_number='unknown',text='The actual quoted instruction.'))
    audit={}
    evidence=retrieve_evidence('p',['instruction'],stats=audit)
    assert len(evidence)==1 and evidence[0].excerpt=='The actual quoted instruction.'
    assert evidence[0].page is None
    assert audit['unresolved_locators']==1


def test_a_preview_without_provable_project_ownership_is_not_used(retrieval):
    con,hits=retrieval
    con.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?)',['foreign','foreign-id','same.pdf',1,'PRIVATE FOREIGN TEXT','c1'])
    hits.append(dict(doc_id='foreign-id',file_name='same.pdf',page_number=1,text_snippet='PRIVATE FOREIGN TEXT'))
    audit={}
    assert retrieve_evidence('p',['notice'],stats=audit)==[]
    assert audit['unresolved_owners']==1

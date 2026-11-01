"""Real metadata/SQL paths must share the document content boundary."""
import json
from types import SimpleNamespace
import duckdb
import pytest
from src.project_context import set_current_project

@pytest.fixture(autouse=True)
def scope():
    set_current_project('')
    yield
    set_current_project('')

@pytest.fixture
def registry(monkeypatch):
    from src.document_registry import DocumentRegistry,DocumentRecord
    r=object.__new__(DocumentRegistry)
    r._records={key:DocumentRecord(key,name,'',1,'document','.pdf',status='completed',project_id=project)
                for key,name,project in [('a','alpha.pdf','project-a'),('b','rival.pdf','project-b')]}
    r._save=lambda:None
    monkeypatch.setattr('src.document_registry.get_document_registry',lambda:r)
    return r

def test_registry_defaults_cannot_leak_names_or_inventory(registry):
    set_current_project('project-a')
    assert [r.doc_id for r in registry.get_all()]==['a']
    assert not registry.search_by_name('rival')
    set_current_project('empty-project')
    assert registry.get_completed()==[]
    set_current_project('')
    assert len(registry.get_all())==2  # Trusted unscoped maintenance remains available.


def test_graph_sql_stats_and_party_names_are_project_private(registry,tmp_path,monkeypatch):
    from src import light_graph as module
    file=tmp_path/'graph.json'
    file.write_text(json.dumps({'nodes':{'a':{'doc_id':'a','sender':'Alpha','file_name':'alpha.pdf'},
                                        'b':{'doc_id':'b','sender':'Rival Secret','file_name':'rival.pdf'}},
                                'edges':[{'from_doc':'a','to_doc':'b','edge_type':'topic'}]}))
    monkeypatch.setattr(module,'GRAPH_FILE',file);monkeypatch.setattr(module,'_project_graphs',{})
    set_current_project('project-a');a=module.get_light_graph()
    assert a.get_document_stats()['total_documents']==1
    assert 'Rival' not in str(a.get_all_parties())
    assert a._try_timeline_sql('how many letters')['answer'].startswith('Found 1')
    assert a._try_timeline_sql("letters from Missing' OR 1=1 --") is None
    with pytest.raises(duckdb.Error):a._db.execute("SELECT * FROM read_text('/etc/passwd')")
    set_current_project('project-b');b=module.get_light_graph()
    assert a is not b and list(b.graph.nodes)==['b']
    assert not a.graph.edges
    a._db.close();b._db.close()


def test_cluster_state_and_labels_are_partitioned_even_for_async_callers(registry,tmp_path,monkeypatch):
    from src import document_clusterer as module
    monkeypatch.setattr(module,'CLUSTERS_FILE',tmp_path/'clusters.json')
    monkeypatch.setattr(module.DocumentClusterer,'_project_instances',{})
    a=module.get_clusterer('project-a')
    assert a.cluster_all(project_id='project-a')=={'uncategorized':['a']}
    assert a._state_file.exists()
    set_current_project('')
    b=module.get_clusterer('project-b')
    assert b is not a and b.get_assignment('a')==(None,None)
    assert b.cluster_all(project_id='project-b')=={'uncategorized':['b']}
    assert b._state_file!=a._state_file
    with pytest.raises(PermissionError):a.cluster_all(project_id='project-b')


def analyzer():
    from src.data_analyzer_sql import DataAnalyzerSQL
    a=DataAnalyzerSQL.__new__(DataAnalyzerSQL);a.conn=duckdb.connect(':memory:')
    a.conn.execute('CREATE TABLE costs_a(amount INTEGER);INSERT INTO costs_a VALUES (7)')
    a.conn.execute('CREATE TABLE costs_b(amount INTEGER);INSERT INTO costs_b VALUES (999)')
    a.tables={'costs_a':{'project_id':'project-a','columns':['amount']},'costs_b':{'project_id':'project-b','columns':['amount']}}
    return a


def test_sql_raw_execution_and_explicit_foreign_table_are_blocked():
    a=analyzer();set_current_project('project-a')
    data,error=a.execute_raw_sql('SELECT sum(amount) total FROM costs_a')
    assert not error and data.iloc[0]['total']==7
    data,error=a.execute_raw_sql('SELECT * FROM costs_b')
    assert data is None and error
    assert a.query('show costs',table_name='costs_b')['sources']==[]
    assert a.query_with_provider('show costs','vllm',table_name='costs_b')['sources']==[]
    assert a._scoped_tables(['costs_b'])==[]
    a.conn.close()


def test_empty_selection_never_uses_largest_foreign_table():
    a=analyzer();set_current_project('empty-project')
    assert a.query('all costs')['sources']==[]
    assert a.sql_table_names()==[]
    assert a.get_table_summary('costs_b') is None
    assert 'costs_b' not in a.get_all_tables_summary()
    a.conn.close()


def test_chat_deletion_requires_editor_role():
    from fastapi import HTTPException
    from src.router import QueryRouter
    router=QueryRouter.__new__(QueryRouter)
    set_current_project('project-a','viewer')
    with pytest.raises(HTTPException) as exc:router._handle_delete_query('alpha.pdf','delete alpha.pdf')
    assert exc.value.status_code==403

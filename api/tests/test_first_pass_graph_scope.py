"""Graph metadata contributes before escalation without relaxing ownership."""
from types import SimpleNamespace
import duckdb
import pytest
from src.light_graph import LightGraph
from src.lexical_index import LexicalIndex


@pytest.fixture
def graph(monkeypatch):
    graph = object.__new__(LightGraph)
    graph._db = duckdb.connect(':memory:')
    graph._notices_table_ready = True
    graph._db.execute('CREATE TABLE notices(doc_id VARCHAR,date VARCHAR,sender VARCHAR,recipient VARCHAR,subject VARCHAR,doc_type VARCHAR,direction VARCHAR,file_name VARCHAR,topics VARCHAR,actions VARCHAR)')
    for doc, date in [('own', '2008-01-01'), ('foreign', '2026-01-01')]:
        graph._db.execute('INSERT INTO notices VALUES (?,?,?,?,?,?,?,?,?,?)',
            [doc, date, 'a', 'b', 'utility delay', 'notice', 'in', doc+'.pdf', 'utility', 'delay'])
    monkeypatch.setattr(graph, '_project_doc_ids', lambda p: {'own'} if p == 'p1' else set())
    yield graph
    graph._db.close()


def test_ownership_is_applied_before_global_limit(graph):
    rows = graph.search_broad(['utility'], project_id='p1', limit=1)
    assert len(rows) == 1 and rows[0]['doc_id'] == 'own'
    assert rows[0]['project_id'] == 'p1'
    assert not graph.search_broad(['utility'], project_id='empty')


def test_graph_boost_reaches_the_first_pass(graph, monkeypatch):
    import src.light_graph as module
    import src.document_registry as registry
    monkeypatch.setattr(module, 'get_light_graph', lambda: graph)
    monkeypatch.setattr(registry, 'get_document_registry', lambda: SimpleNamespace(get_completed=lambda **k: []))
    boosts = LexicalIndex().match_docs(['utility'], project_id='p1')
    assert boosts == {'own': 1.0}
    assert LexicalIndex().match_docs(['utility'], project_id='empty') == {}


def test_unavailable_ownership_fails_closed(graph, monkeypatch):
    monkeypatch.setattr(graph, '_project_doc_ids', lambda p: None)
    assert graph.search_broad(['utility'], project_id='p1') == []

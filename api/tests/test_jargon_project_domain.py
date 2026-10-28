"""Ambiguous terms use this project's domain before retrieval/classification."""
from types import SimpleNamespace
from src.jargon_manager import JargonManager, project_domain_hint


def test_project_lookup_uses_the_real_store_api_and_does_not_cache_domains(monkeypatch):
    import src.project_store as store
    import src.project_context as context
    current = ['edinburgh']
    names = {'edinburgh':{'name':'Edinburgh — integration sample'}, 'generic':{'name':'Generic project'}}
    monkeypatch.setattr(context, 'get_current_project_id', lambda: current[0])
    monkeypatch.setattr(store, 'get_project_store', lambda: SimpleNamespace(get=names.get))
    assert project_domain_hint() == names['edinburgh']['name']
    current[0] = 'generic'
    assert project_domain_hint() == 'Generic project'
    current[0] = ''
    assert project_domain_hint() == ''


def test_edinburgh_senses_are_used_in_prepared_and_legacy_queries(monkeypatch):
    import src.jargon_manager as module
    monkeypatch.setattr(module, 'project_domain_hint', lambda *args: 'Edinburgh — integration sample')
    manager = JargonManager()
    for query in (manager.expand_query('PB and SDS'),
                  manager.replace_query_terms_with_meanings('PB and SDS'),
                  manager.prepare_query('PB and SDS').retrieval_queries[1]):
        assert 'Parsons Brinckerhoff' in query
        assert 'System Design Services' in query
        assert 'Performance Bond' not in query and 'Safety Data Sheet' not in query


def test_unknown_domain_does_not_force_edinburgh():
    meaning = 'Performance Bond [generic] | Parsons Brinckerhoff [Edinburgh Tram Inquiry]'
    assert JargonManager.retrieval_sense(meaning, 'Generic project') == 'Performance Bond'
    sds = 'Safety Data Sheet [HSE] | System Design Services [Edinburgh Tram Inquiry]'
    assert JargonManager.retrieval_sense(sds, 'HSE review') == 'Safety Data Sheet'


def test_chronology_uses_the_same_project_domain_lookup(monkeypatch):
    import src.jargon_manager as module
    from src.chronology_v2 import _project_domain_hint
    monkeypatch.setattr(module, 'project_domain_hint', lambda pid: 'domain-'+pid)
    assert _project_domain_hint('owned') == 'domain-owned'

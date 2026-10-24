"""Parallel drafting preserves tenant attribution, durable usage and retry state."""
import json
import threading
from types import SimpleNamespace

import pytest

from src import chronology_v2 as pipeline
from src.evidence_model import EvidenceItem
from src.run_store import RunStore, current_run_id_var
from src.project_context import current_project_id_var


def test_three_workers_keep_scope_charge_and_reuse_steps(tmp_path, monkeypatch):
    from backend.core.security import current_user_var, UserContext
    from src import user_store, llm_client, run_store
    users = user_store.UserStore(db_path=tmp_path / 'users.db')
    monkeypatch.setattr(user_store.UserStore, '_instance', users)
    runs = RunStore(tmp_path / 'runs.db')
    monkeypatch.setattr(run_store, 'get_run_store', lambda: runs)
    users.create_user('alice', 'secret', token_limit=1000000)
    users.create_user('other', 'secret', token_limit=1000000)
    run = runs.start(project_id='project-a', username='alice', module='chronology', query='q')
    tokens = [current_user_var.set(UserContext(username='alice', role='user', display_name='Alice',
              features={}, token_limit=1000000)), current_project_id_var.set('project-a')]
    barrier = threading.Barrier(3, timeout=10)
    seen = []
    lock = threading.Lock()
    saved = {}
    good = {'text': 'Notice 17 was issued.', 'source_ids': ['s1']}
    events = [{'cluster_id': str(i), 'claims': [good]} for i in range(2)]
    monkeypatch.setattr(pipeline, '_cluster_events', lambda values: values)
    monkeypatch.setattr(pipeline, '_synthesis_batches', lambda *args: [[e] for e in events])

    def generate(prompt, **kwargs):
        barrier.wait()
        with lock:
            seen.append((threading.get_ident(), current_project_id_var.get(), current_run_id_var.get()))
        llm_client._attribute_to_current_user(10, 5, provider='gemini', model='test',
                                             cost_nanos=1000000, task_type='chronology_synthesis')
        from src.types import LLMUsage
        llm_client._record_run_usage(LLMUsage(provider='gemini', model='test',
            prompt_tokens=10, completion_tokens=5, total_tokens=15, cost_estimate=.001,
            latency_ms=1, cache_hit=False))
        if kwargs['schema_name'] == 'chronology_v2_overview':
            return SimpleNamespace(raw={'overview_claims': [good]})
        batch = json.loads(prompt.split('EVENT CLUSTERS:\n')[1].split('\n\nEVIDENCE BEGIN')[0])
        return SimpleNamespace(raw={'entries': batch})

    monkeypatch.setattr(llm_client, 'generate_response_json', generate)
    def save(key, input_hash, status, output, error):
        with lock:
            saved[(key, input_hash)] = {'status': status, 'output': output}
    kwargs = dict(prepared=pipeline.PreparedChronologyQuery('q', 'q', (), (), (), (), (), ('q',)),
        candidates=events, evidence=[EvidenceItem('s1', 'd1', 'notice.pdf', excerpt=good['text'])],
        cache_context='test', save_step=save,
        load_step=lambda key, value: saved.get((key, value)))
    try:
        first = pipeline.synthesize(**kwargs)
        assert pipeline.synthesize(**kwargs) == first
        assert len(seen) == 3 and len({t[0] for t in seen}) == 3
        assert all(t[1:] == ('project-a', run) for t in seen)
        assert [e['cluster_id'] for e in first['entries']] == ['0', '1']
        assert users.get_usage('alice')['total_calls'] == 3
        assert users.get_usage('other')['used_tokens'] == 0
        with users._connect() as db:
            rows = db.execute('SELECT username,project_id,run_id,provider_cost_nanos FROM billing_ledger WHERE event_type=?', ['charge']).fetchall()
        assert len(rows) == 3
        assert all(tuple(row) == ('alice', 'project-a', run, 1000000) for row in rows)
        with runs._connect() as db:
            assert db.execute('SELECT COUNT(*),SUM(prompt_tokens) FROM llm_calls WHERE run_id=?', [run]).fetchone()[0:2] == (3, 30)
    finally:
        current_project_id_var.reset(tokens[1])
        current_user_var.reset(tokens[0])
        current_run_id_var.set('')


def test_parallel_provider_failure_is_not_returned_as_success(monkeypatch):
    from src import llm_client
    monkeypatch.setattr(llm_client, 'generate_response_json', lambda *a, **k: (_ for _ in ()).throw(RuntimeError('provider unavailable')))
    with pytest.raises(RuntimeError, match='provider unavailable'):
        pipeline.synthesize(prepared=pipeline.PreparedChronologyQuery('q', 'q', (), (), (), (), (), ('q',)),
                            candidates=[], evidence=[], cache_context='test')

"""Rejected wording is repaired locally and independently checked, at most once."""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from src import chronology_v2, llm_client
from src.chronology_claim_repair import repair_rejected_claims
from src.evidence_model import EvidenceItem


def inputs():
    source = EvidenceItem('s1', 'd1', 'agreement.pdf', page=3,
        excerpt='A Memorandum of Agreement is required to be formally executed in June 2007. Deliverables will be reviewed.')
    claim = {'text': 'A Memorandum of Agreement was executed in June 2007.', 'source_ids': ['s1']}
    background = {'text': 'Deliverables will be reviewed.', 'source_ids': ['s1']}
    chronology = {'overview_claims': [background], 'entries': [{
        'event_date': '2007-06', 'date_precision': 'month', 'date_source': 'content_body',
        'date_evidence': 'June 2007', 'claims': [claim, background],
    }]}
    return dict(chronology=chronology, verification={
        'overview:0': True, 'event:0:0': False, 'event:0:1': True,
        'date:0': False, 'date:0:0': False, 'date:0:1': False,
    }, evidence=[source], prepared=chronology_v2.PreparedChronologyQuery('q','q',(),(),(),(),(),('q',)), cache_context='job')


def test_only_rejected_wording_is_repaired_and_verified_again(monkeypatch):
    original = inputs(); untouched = deepcopy(original['chronology']); calls = []; checks = []; saved = {}
    replacement = {'text': 'A Memorandum of Agreement was planned for June 2007.', 'source_ids': ['s1']}
    def generate(prompt, **kwargs):
        calls.append(prompt)
        assert 'OWN cited evidence' in prompt
        assert 's1' in prompt and 'foreign' not in prompt
        return SimpleNamespace(raw={'items': [{'claim_ref': 'event:0:0', 'replacement': replacement}]})
    def verify(**kwargs):
        checks.append(kwargs)
        assert len(kwargs['chronology']['entries']) == 1
        assert kwargs['chronology']['entries'][0]['claims'][0]['text'] == replacement['text']
        return {'event:0:0': True, 'date:0': True}
    monkeypatch.setattr(llm_client, 'generate_response_json', generate)
    monkeypatch.setattr(chronology_v2, 'verify_claims', verify)
    def save(key, value, status, output, error): saved[(key,value)]={'status':status,'output':output}
    kwargs=dict(load_step=lambda k,h: saved.get((k,h)), save_step=save)
    result, decisions, stats = repair_rejected_claims(**original, **kwargs)
    assert original['chronology'] == untouched
    assert result['entries'][0]['claims'][0]['text'] == replacement['text']
    assert result['entries'][0]['claims'][1] == untouched['entries'][0]['claims'][1]
    assert decisions['event:0:0'] and decisions['date:0:0'] and not decisions['date:0']
    assert stats == {'attempted':1,'accepted':1,'dates_verified':1,'unresolved':0}
    assert repair_rejected_claims(**original, **kwargs)[0] == result
    assert len(calls) == len(checks) == 1


@pytest.mark.parametrize('replacement', [
    {'text':'A foreign claim.', 'source_ids':['foreign']},
    {'text':'A payment of 999 was approved.', 'source_ids':['s1']},
    None,
])
def test_repair_cannot_widen_sources_or_add_unsupported_numbers(monkeypatch, replacement):
    monkeypatch.setattr(llm_client, 'generate_response_json', lambda *a, **k: SimpleNamespace(
        raw={'items':[{'claim_ref':'event:0:0','replacement':replacement}]}))
    monkeypatch.setattr(chronology_v2, 'verify_claims', lambda **k: pytest.fail('Invalid repair reached verification'))
    kwargs=inputs()
    result, decisions, stats=repair_rejected_claims(**kwargs)
    assert result == kwargs['chronology'] and not decisions['event:0:0']
    assert stats['unresolved'] == 1 and stats['accepted'] == 0


def test_repair_has_no_work_when_facts_and_dates_are_accepted(monkeypatch):
    kwargs=inputs();kwargs['verification'].update({'event:0:0':True,'date:0:0':True})
    monkeypatch.setattr(llm_client,'generate_response_json',lambda *a,**k:pytest.fail('Unnecessary repair'))
    assert repair_rejected_claims(**kwargs)[2]['attempted'] == 0


@pytest.mark.parametrize('error', [RuntimeError('provider unavailable'), ValueError('credit exhausted')])
def test_systemic_repair_errors_are_not_hidden_as_success(monkeypatch, error):
    def fail(*args, **kwargs): raise error
    monkeypatch.setattr(llm_client, 'generate_response_json', fail)
    with pytest.raises(type(error), match=str(error)):
        repair_rejected_claims(**inputs())


def test_malformed_repair_does_not_restart_research_or_loop(monkeypatch):
    calls=[]
    def fail(*args, **kwargs):
        calls.append(1)
        raise llm_client.LLMInvalidStructuredOutputError('model_output_invalid')
    monkeypatch.setattr(llm_client, 'generate_response_json', fail)
    kwargs=inputs()
    result, decisions, stats=repair_rejected_claims(**kwargs)
    assert calls == [1] and stats['unresolved'] == 1
    assert result == kwargs['chronology'] and not decisions['event:0:0']

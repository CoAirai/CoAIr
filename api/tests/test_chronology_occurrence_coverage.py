"""Regressions from live reports that lost programme targets and proven dates."""
import json
import pytest
from types import SimpleNamespace

from src import chronology_v2 as pipeline
from src.evidence_model import EvidenceItem


def test_generation_schema_advertises_only_supported_date_provenance():
    for model in (pipeline.ExtractionModel, pipeline.EventSynthesisModel):
        schema = model.model_json_schema()
        field = schema['$defs']['EventModel']['properties']['date_source']
        assert set(field['enum']) == pipeline.ALLOWED_DATE_SOURCES
        assert 'text' not in field['enum'] and 'metadata' not in field['enum']


def test_date_proof_accepts_pdf_line_wrapping_without_inventing_a_year():
    evidence = [EvidenceItem('s1', 'd1', 'agreement.pdf', excerpt=(
        'Meeting held on Thursday 15th\nMarch 2007. On 20th October tie responded.'
    ))]
    claim = {'text': 'The parties agreed a phased transition.', 'source_ids': ['s1']}
    base = {'date_precision': 'exact', 'date_source': 'content_body', 'claims': [claim]}
    proven = {**base, 'event_date': '2007-03-15', 'date_evidence': 'Thursday 15th March 2007'}
    assert pipeline._enforce_event_date(proven, evidence)['event_date'] == '2007-03-15'
    for invalid in (
        {**proven, 'date_source': 'text'},
        {**proven, 'date_source': 'metadata'},
        {**proven, 'date_evidence': 'Thursday 16th March 2007'},
        {**base, 'event_date': '2008-10-20', 'date_evidence': 'On 20th October'},
    ):
        assert pipeline._enforce_event_date(invalid, evidence)['event_date'] == ''


def test_synthesis_cannot_erase_a_source_proven_candidate_date(monkeypatch):
    from src import llm_client
    claim = {'text': 'The parties agreed a phased transition.', 'source_ids': ['s1']}
    evidence = [EvidenceItem('s1', 'd1', 'agreement.pdf', excerpt=(
        'On 15 March 2007 the parties agreed a phased transition.'
    ))]
    candidate = {'cluster_id': 'meeting', 'event_date': '2007-03-15',
                 'date_precision': 'exact', 'date_source': 'content_body',
                 'date_evidence': '15 March 2007', 'claims': [claim]}
    def generate(prompt, **kwargs):
        if kwargs['schema_name'] == 'chronology_v2_overview':
            return SimpleNamespace(raw={'overview_claims': [claim]})
        events = json.loads(prompt.split('EVENT CLUSTERS:\n')[1].split('\n\nEVIDENCE BEGIN')[0])
        for event in events:
            event.update(event_date='', date_source='unresolved', date_evidence='')
        return SimpleNamespace(raw={'entries': events})
    monkeypatch.setattr(llm_client, 'generate_response_json', generate)
    result = pipeline.synthesize(
        prepared=pipeline.PreparedChronologyQuery('q', 'q', (), (), (), (), (), ('q',)),
        candidates=[candidate], evidence=evidence, cache_context='test',
    )
    assert result['entries'][0]['event_date'] == '2007-03-15'
    assert result['entries'][0]['date_evidence'] == '15 March 2007'


def test_every_document_is_read_in_bounded_windows_and_unchanged_windows_reuse(monkeypatch):
    evidence = [EvidenceItem(f's{doc}-{page}', f'd{doc}', f'{doc}.pdf', page=page,
                excerpt=(f'Programme target {page}: mobilise on 12 January 2007. ' + 'details '*550))
                for doc in range(5) for page in range(1, 5)]
    calls = []
    saved = {}
    def extract(**kwargs):
        batch = kwargs['batch']
        calls.append([item.source_id for item in batch])
        assert len({(item.doc_id, item.page) for item in batch}) == 1
        assert len(pipeline.evidence_markdown(batch)) <= pipeline.EXTRACTION_WINDOW_CHARS
        return [{'claims': [{'text': f'Programme target {item.page}: mobilise on 12 January 2007.',
                             'source_ids': [item.source_id]}]} for item in batch]
    monkeypatch.setattr(pipeline, 'extract_batch', extract)
    def save(key, value, status, output, error):
        saved[value] = {'status': status, 'output': output}
    def load(key, value):
        return saved.get(value)
    prepared = pipeline.PreparedChronologyQuery('programme', 'programme', (), (), (), (), (), ('q',))
    first = pipeline.extract_batches(evidence, prepared, load_step=load, save_step=save)
    assert len(first) == len(evidence)
    assert sorted(s for batch in calls for s in batch) == sorted(item.source_id for item in evidence)
    count = len(calls)
    # A new document must not invalidate unchanged document windows.
    extra = EvidenceItem('new', 'd-1', '00.pdf', page=1, excerpt='Programme target 1: mobilise on 12 January 2007.')
    stats = {}
    pipeline.extract_batches([extra, *reversed(evidence)], prepared, load_step=load, save_step=save, stats=stats)
    assert len(calls) == count + 1
    assert stats['batches_reused'] == count


def test_programme_target_windows_preserve_every_word_and_separate_each_deadline():
    source = EvidenceItem('schedule', 'd1', 'programme.pdf', page=3, excerpt=(
        'Transfer utility dates to programme.\nComplete by 7 November 2008\n'
        'Consider MUDFA works in detail.\nComplete by 21 November 2008\n'
        'Incorporate post V31 design delays.\nComplete by 19 December 2008\n'
        'Remaining undated qualifications and footer.'
    ))
    windows = pipeline.occurrence_windows(source)
    assert len(windows) == 3
    assert ''.join(w.excerpt for w in windows) == source.excerpt
    assert all(w.source_id == source.source_id and w.page == 3 for w in windows)
    assert 'Incorporate post V31' in windows[-1].excerpt
    assert all(w.excerpt.count('Complete by') == 1 for w in windows)


def test_target_date_recovery_uses_its_own_claim_and_never_fills_missing_year():
    source = EvidenceItem('s1', 'd1', 'schedule.pdf', page=4, excerpt=(
        'Incorporate changed designs.\nComplete by end January 2009\n'
    ))
    event = {'claims': [{'text': 'Changed designs were to be incorporated by end January 2009.',
                         'source_ids': ['s1']}]}
    restored = pipeline._restore_programme_target_dates([event], [source])[0]
    assert restored['event_date'] == '2009-01'
    assert restored['date_precision'] == 'month'  # Never invent 31 January.
    assert restored['date_evidence'] == 'end January 2009'
    unrelated = {'claims': [{'text': 'The contractor received an instruction.', 'source_ids': ['s1']}]}
    assert not pipeline._restore_programme_target_dates([unrelated], [source])[0].get('event_date')
    no_year = EvidenceItem('s2', 'd2', 'schedule.pdf', excerpt='Complete by 20 October')
    missing = {'claims': [{'text': 'Target completion was 20 October.', 'source_ids': ['s2']}]}
    assert not pipeline._restore_programme_target_dates([missing], [no_year])[0].get('event_date')


@pytest.mark.parametrize("whole_event_approved", [False, True])
def test_verified_target_is_dated_and_unrelated_background_is_retained_undated(monkeypatch, whole_event_approved):
    from src import ai_reports
    target = {'text': 'Scope changes were scheduled for completion by 5 December 2008.', 'source_ids': ['s1']}
    background = {'text': 'Subcontractor information was missing.', 'source_ids': ['s1']}
    source = EvidenceItem('s1', 'd1', 'programme.pdf', page=3,
        excerpt='Scope changes were scheduled for completion by 5 December 2008. Subcontractor information was missing.')
    event = {'event_date': '2008-12-05', 'date_precision': 'exact', 'date_source': 'content_body',
             'date_evidence': '5 December 2008', 'claims': [target, background]}
    monkeypatch.setattr(pipeline, 'evidence_from_documents', lambda *a: [source])
    monkeypatch.setattr(pipeline, 'extract_batches', lambda *a, **k: [event])
    monkeypatch.setattr(pipeline, 'synthesize', lambda **k: {'overview_claims': [background], 'entries': [event]})
    monkeypatch.setattr(pipeline, 'verify_claims', lambda **k: {
        'overview:0': True, 'event:0:0': True, 'event:0:1': True,
        'date:0': whole_event_approved, 'date:0:0': True, 'date:0:1': False,
    })
    monkeypatch.setattr(ai_reports, '_model_for_task', lambda *a: 'test')
    result = ai_reports._generate_chronology_v2(project_id='p', project_name='Review', topic='Scope changes',
        source_doc_ids=['d1'], preparation={'prepared': {'english_query': 'Scope changes'}})
    events = [e for e in result['entries'] if e['event_type'] != 'overview']
    assert len(events) == 2
    dated = next(e for e in events if e['event_date'])
    undated = next(e for e in events if not e['event_date'])
    assert dated['event_date'] == '2008-12-05'
    assert [c['text'] for c in dated['claims']] == [target['text']]
    assert [c['text'] for c in undated['claims']] == [background['text']]


def test_verifier_requests_individual_temporal_proofs_for_a_mixed_event(monkeypatch):
    from src import llm_client
    seen = []
    def generate(prompt, **kwargs):
        values = json.loads(prompt.split('CLAIMS:\n')[1].split('\n\nEVIDENCE BEGIN')[0])
        seen.extend(values)
        return SimpleNamespace(raw={'decisions': [dict(claim_ref=v['claim_ref'], supported=True) for v in values]})
    monkeypatch.setattr(llm_client, 'generate_response_json', generate)
    claims = [{'text': 'Programme target.', 'source_ids': ['s1']}, {'text': 'Undated background.', 'source_ids': ['s1']}]
    pipeline.verify_claims(prepared=pipeline.PreparedChronologyQuery('q', 'q', (), (), (), (), (), ('q',)),
        chronology={'overview_claims': [], 'entries': [{'event_date': '2008-12-05', 'claims': claims}]},
        evidence=[EvidenceItem('s1', 'd1', 'p.pdf', excerpt='Programme target. Undated background.')], cache_context='test')
    temporal = {v['claim_ref']: v for v in seen if v.get('verification_kind') == 'event_date'}
    assert temporal['date:0:0']['text'] == 'Programme target.'
    assert temporal['date:0:1']['text'] == 'Undated background.'


def test_conflicting_ocr_day_tokens_do_not_prove_a_trailing_date():
    source = EvidenceItem('s1', 'd1', 'letter.pdf', excerpt='Programme under cover of letter dated 1st\n11\nApril 2007.')
    event = {'event_date': '2007-04-11', 'date_precision': 'exact', 'date_source': 'content_body',
             'date_evidence': '11 April 2007', 'claims': [{'text': 'Programme submitted.', 'source_ids': ['s1']}]}
    assert pipeline._enforce_event_date(event, [source])['event_date'] == ''
    event.update(event_date='2007-04', date_precision='month', date_evidence='April 2007')
    assert pipeline._enforce_event_date(event, [source])['event_date'] == '2007-04'


def test_ambiguous_ocr_day_does_not_survive_in_factual_narrative():
    source = EvidenceItem('s1', 'd1', 'letter.pdf', excerpt='Programme letter dated 1st\n11\nApril 2007.')
    claim = {'text': 'The programme letter was dated 11 April 2007.', 'source_ids': ['s1']}
    assert not pipeline._claims_are_source_valid({'entries': [{'claims': [claim]}]}, [source])
    generic = {**claim, 'text': 'The programme letter was submitted.'}
    assert pipeline._claims_are_source_valid({'entries': [{'claims': [generic]}]}, [source])
    confirming = EvidenceItem('s2', 'd2', 'register.pdf', excerpt='Programme letter dated 11 April 2007.')
    confirmed = {**claim, 'source_ids': ['s1', 's2']}
    assert pipeline._claims_are_source_valid({'entries': [{'claims': [confirmed]}]}, [source, confirming])


def test_prose_target_month_is_recovered_from_its_own_source_and_claim_only():
    source = EvidenceItem('s1', 'd1', 'agreement.pdf', excerpt='A Memorandum of Agreement is to be formally executed in June 2007.')
    event = {'claims': [{'text': 'A Memorandum of Agreement was planned for June 2007.', 'source_ids': ['s1']}]}
    result = pipeline._restore_programme_target_dates([event], [source])[0]
    assert result['event_date'] == '2007-06' and result['date_precision'] == 'month'
    foreign_year = {'claims': [{'text': 'A Memorandum of Agreement was planned for June 2008.', 'source_ids': ['s1']}]}
    assert not pipeline._restore_programme_target_dates([foreign_year], [source])[0].get('event_date')


def test_ocr_ambiguity_does_not_discard_a_different_proven_date_on_the_same_page():
    source = EvidenceItem('s1', 'd1', 'agreement.pdf', excerpt=(
        'The parties agreed a phased transition on 15th\nMarch 2007. Letter dated 1st\n11\nApril 2007.'
    ))
    claim = {'text': 'The parties agreed a phased transition on 15 March 2007.', 'source_ids': ['s1']}
    assert pipeline._claims_are_source_valid({'entries': [{'claims': [claim]}]}, [source])
    restored = pipeline._restore_programme_target_dates([{'claims': [claim]}], [source])[0]
    assert restored['event_date'] == '2007-03-15'
    assert restored['date_evidence'] == '15th\nMarch 2007'

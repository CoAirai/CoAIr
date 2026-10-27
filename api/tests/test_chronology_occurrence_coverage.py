"""Regressions from live reports that lost programme targets and proven dates."""
import json
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
        assert len({item.doc_id for item in batch}) == 1
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

"""The displayed stage must precede its work, including verification and Word."""
from src import ai_reports, chronology_v2
from src.evidence_model import EvidenceItem


def test_report_emits_verification_and_word_before_the_work(monkeypatch):
    stages = []
    claim = {'text': 'Engineer issued notice 17.', 'source_ids': ['s1']}
    event = {'claims': [claim]}
    monkeypatch.setattr(chronology_v2, 'evidence_from_documents', lambda *a: [
        EvidenceItem('s1', 'd1', 'notice.pdf', excerpt=claim['text'])])
    monkeypatch.setattr(chronology_v2, 'extract_batches', lambda *a, **k: [event])
    monkeypatch.setattr(chronology_v2, 'synthesize', lambda **k: {
        'overview_claims': [claim], 'entries': [event]})
    def verify(**kwargs):
        assert stages[-1] == ('verification', .82)
        return {'overview:0': True, 'event:0:0': True}
    monkeypatch.setattr(chronology_v2, 'verify_claims', verify)
    build = ai_reports.build_ai_chronology_docx
    def word(**kwargs):
        assert stages[-1] == ('word', .9)
        return build(**kwargs)
    monkeypatch.setattr(ai_reports, 'build_ai_chronology_docx', word)
    monkeypatch.setattr(ai_reports, '_model_for_task', lambda task: 'selected-runtime-model')
    result = ai_reports._generate_chronology_v2(project_id='a', project_name='Qualification',
        topic='Notice 17', source_doc_ids=['d1'],
        preparation={'prepared': {'original_query': 'Notice 17', 'english_query': 'Notice 17'}},
        stage_callback=lambda name, progress: stages.append((name, progress)))
    assert result['model'] == 'selected-runtime-model'
    assert result['docx'].startswith(b'PK')
    assert [progress for _, progress in stages] == sorted(progress for _, progress in stages)

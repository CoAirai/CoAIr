from src.local_metadata import EvidenceField, evidence_valid, valid_date


def test_rejects_invented_person():
    pages={1:'Sent: 08 March 2011\nJason Chandler wrote to Kevin Russell.'}
    assert evidence_valid(EvidenceField(value='Jason Chandler',page=1,quote='Jason Chandler wrote'),pages)
    assert not evidence_valid(EvidenceField(value='John Smith',page=1,quote='Jason Chandler wrote'),pages)
    assert not evidence_valid(EvidenceField(value='Jason Chandler',page=2,quote='Jason Chandler wrote'),pages)


def test_date_must_match_explicit_header_not_body_event():
    pages={1:'Sent: 08 March 2011\nThe project started on 1 January 2010.'}
    assert valid_date(EvidenceField(value='2011-03-08',page=1,quote='Sent: 08 March 2011'),pages)
    assert not valid_date(EvidenceField(value='2010-01-01',page=1,quote='The project started on 1 January 2010.'),pages)
    assert not valid_date(EvidenceField(value='2011-08-03',page=1,quote='Sent: 08 March 2011'),pages)
    assert not valid_date(EvidenceField(value='2011-03-08',page=2,quote='Sent: 08 March 2011'),pages)


def test_ambiguous_numeric_date_requires_review():
    assert not valid_date(EvidenceField(value='2011-03-08',page=1,quote='Date: 03/08/2011'),{1:'Date: 03/08/2011'})


def test_local_queries_never_recursively_expand_glossary(monkeypatch):
    from src import config
    from src.jargon_manager import get_jargon_manager
    monkeypatch.setattr(config,'LOCAL_LLM',True)
    jargon=get_jargon_manager()
    text='Who sent the EOT letter?'
    assert jargon.expand_query(text) == text
    expanded=jargon.replace_query_terms_with_meanings(text)
    assert len(expanded) < len(text) + 2000


def test_local_selection_does_not_inline_entire_documents(monkeypatch):
    from src import config
    from backend.services.chat_orchestrator import ChatOrchestrator
    monkeypatch.setattr(config,'LOCAL_LLM',True)
    assert ChatOrchestrator()._build_document_context(['some-file'],'some-project') == ''


def test_name_quote_recovered_only_from_literal_source_line():
    from src.local_metadata import EvidenceField, ground_name
    pages = {1: 'From: Chandler, Jason <j@example.test>\nTo: Kevin Russell'}
    field = EvidenceField(value='Chandler, Jason', page=1, quote='Wrong quotation')
    assert ground_name(field, pages)
    assert field.quote == 'From: Chandler, Jason <j@example.test>'
    assert not ground_name(EvidenceField(value='Invented Person', page=1), pages)
    assert not ground_name(EvidenceField(value='Kevin Russell', page=2), pages)


def test_explicit_header_recovers_model_missing_date(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace
    from src import local_metadata, llm_client
    monkeypatch.setattr(local_metadata, 'STORAGE_DIR', tmp_path)
    response = {'title':'Email about design', 'summary':'Design information supplied.', 'document_type':'email',
                'document_date':{'value':'','page':1,'quote':''},'people':[],'organizations':[],'topics':[]}
    monkeypatch.setattr(llm_client, 'generate_text', lambda *a, **kw: SimpleNamespace(
        text=json.dumps(response), usage=SimpleNamespace(latency_ms=1)))
    result=local_metadata.extract_metadata(project_id='p',file_id='f',file_name='email.pdf',
        pages={1:'From: Jason\nSent: 08 March 2011 23:46\nProject started 1 January 2010.'})
    assert result['date']=='2011-03-08'
    assert result['evidence']['document_date']['quote']=='Sent: 08 March 2011 23:46'


def test_metadata_failure_remains_visible_without_blocking_text_ingestion(tmp_path, monkeypatch):
    from src import local_metadata
    monkeypatch.setattr(local_metadata, 'STORAGE_DIR', tmp_path)
    def fail(**kwargs):
        raise RuntimeError('model_output_incomplete')
    monkeypatch.setattr(local_metadata, 'extract_metadata', fail)
    result = local_metadata.extract_metadata_for_ingestion(project_id='p', file_id='f',
        file_name='source.pdf', pages={1:'The original extracted text.'})
    assert result['status'] == 'needs_review'
    assert result['review_reasons'] == ['metadata_extraction_failed']
    assert result['summary'] == '' and result['date'] == ''
    assert (tmp_path/'document_metadata/p/f/metadata-failure.json').exists()


def test_metadata_schema_bounds_expensive_generated_strings():
    import pytest
    from pydantic import ValidationError
    from src.local_metadata import EvidenceField
    with pytest.raises(ValidationError):
        EvidenceField(value='Jason Chandler', quote='x' * 161)

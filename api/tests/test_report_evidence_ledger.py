from types import SimpleNamespace
from src.evidence_model import EvidenceItem
from src.report_evidence_ledger import evidence_ledger,repair_chronology_evidence


def test_repair_searches_only_missing_facets_once_and_keeps_existing_sources():
    original=EvidenceItem('s1','d1','a.pdf',excerpt='Contract agreement; programme schedule; design access; instruction notice; asserted position; delay prolongation; dispute resolution.',score=1)
    added=EvidenceItem('s2','d2','b.pdf',excerpt='The records were missing and inconsistent.',score=1)
    calls=[]
    def retrieve(project,queries):calls.append((project,queries));return [original,added]
    audit={}
    found=repair_chronology_evidence([original],SimpleNamespace(english_query='Utility diversion'),project_id='p',retrieve=retrieve,audit=audit)
    assert len(calls)==1 and len(calls[0][1])==1
    assert 'contradictions missing' in calls[0][1][0]
    assert {i.source_id for i in found}=={'s1','s2'}
    assert audit['missing_after']==[] and audit['new_passages']==1
    def never(*a):raise AssertionError('Covered facets must not start another search')
    assert repair_chronology_evidence(found,SimpleNamespace(english_query='Utility diversion'),project_id='p',retrieve=never,audit={})==found


def test_ledger_keeps_raw_text_out_and_marks_retrieval_failures_partial():
    evidence=[EvidenceItem('s1','d1','a.pdf',page=20,excerpt='Private raw evidence')]
    ledger=evidence_ledger(evidence,scope='topic_retrieval',retrieval_rounds=[{'lane_errors':[{'lane':'dense'}],'unhydrated_previews':1}])
    assert ledger['documents'][0]['pages']==[20]
    assert 'Private raw evidence' not in str(ledger)
    assert set(ledger['partial_reasons'])=={'retrieval_lane_failed','source_text_incomplete'}
    assert ledger['exhaustive_corpus_read'] is False
    assert evidence_ledger(evidence,scope='topic_retrieval')['evidence_sha256']==ledger['evidence_sha256']

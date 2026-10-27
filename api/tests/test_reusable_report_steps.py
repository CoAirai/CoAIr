from types import SimpleNamespace
from backend.tasks.report_jobs import ReportJobStore
from src import chronology_v2
from src.evidence_model import EvidenceItem


def test_only_same_user_project_and_version_can_reuse_completed_extraction(tmp_path):
    store=ReportJobStore(tmp_path/'jobs.db')
    def job(project='a',user='alice',version='chronology-v2'):
        return store.enqueue(project_id=project,username=user,module='chronology',title='Notices',request={},pipeline_version=version)['job_id']
    original=job()
    store.save_step(original,'extract:1','hash','ready',{'entries':[]},'')
    target=job()
    assert store.load_reusable_step(target,'extract:2','hash') is None
    store.complete(original,{'entries':[],'pipeline_version':'chronology-v2'},'report.docx')
    assert store.load_reusable_step(target,'extract:2','hash')['job_id']==original
    assert store.load_reusable_step(job(project='b'),'extract:1','hash') is None
    assert store.load_reusable_step(job(user='bob'),'extract:1','hash') is None
    assert store.load_reusable_step(job(version='chronology-v3'),'extract:1','hash') is None
    assert store.load_reusable_step(target,'extract:1','new-content') is None
    assert store.load_reusable_step(target,'verification:1','hash') is None


def test_extraction_cache_invalidates_on_query_and_revalidates_source_quotes(monkeypatch):
    saved={};calls=[]
    model=["model-a"];jargon=["jargon-a"]
    monkeypatch.setattr("src.llm_client._model_for_task",lambda task:model[0])
    monkeypatch.setattr(chronology_v2,"jargon_dictionary_version",lambda:jargon[0])
    def extract(**kwargs):
        calls.append(kwargs)
        return [{'claims':[{'text':'Engineer issued notice 17.','source_ids':['s1']}]}]
    monkeypatch.setattr(chronology_v2,'extract_batch',extract)
    evidence=[EvidenceItem('s1','d1','notice.pdf',excerpt='Engineer issued notice 17.')]
    def load(key,value):return saved.get(value)
    def save(key,value,status,output,error):saved[value]={'status':status,'output':output}
    prepared=chronology_v2.PreparedChronologyQuery('notices','notices',(),(),(),(),(),('q',))
    kwargs=dict(load_step=load,save_step=save)
    chronology_v2.extract_batches(evidence,prepared,**kwargs)
    stats={}
    chronology_v2.extract_batches(evidence,prepared,stats=stats,**kwargs)
    assert len(calls)==1 and stats['batches_reused']==1
    from dataclasses import replace
    chronology_v2.extract_batches([replace(evidence[0],score=0.5)],prepared,**kwargs)
    assert len(calls)==1  # Ranking metadata is not part of the extraction prompt.
    changed=chronology_v2.PreparedChronologyQuery('costs','costs',(),(),(),(),(),('q',))
    chronology_v2.extract_batches(evidence,changed,**kwargs)
    assert len(calls)==2
    model[0]="model-b"
    chronology_v2.extract_batches(evidence,prepared,**kwargs)
    assert len(calls)==3
    jargon[0]="jargon-b"
    chronology_v2.extract_batches(evidence,prepared,**kwargs)
    assert len(calls)==4
    for row in saved.values():
        row['output']={'entries':[{'claims':[{'text':'A fabricated cost 999 was paid.','source_ids':['s1']}]}]}
    chronology_v2.extract_batches(evidence,prepared,**kwargs)
    assert len(calls)==5


def test_same_evidence_in_a_different_retrieval_order_reuses_one_extraction(monkeypatch):
    saved={};calls=[]
    evidence=[EvidenceItem('s1','d1','a.pdf',page=1,excerpt='Engineer issued notice 17.'),EvidenceItem('s2','d2','b.pdf',page=2,excerpt='Contractor received notice 18.')]
    def extract(**kwargs):
        calls.append([e.source_id for e in kwargs['batch']])
        return [{'claims':[{'text':'Engineer issued notice 17.','source_ids':['s1']}]}]
    monkeypatch.setattr(chronology_v2,'extract_batch',extract)
    def load(key,value):return saved.get(value)
    def save(key,value,status,output,error):saved[value]={'status':status,'output':output}
    prepared=chronology_v2.PreparedChronologyQuery('notices','notices',(),(),(),(),(),('q',))
    chronology_v2.extract_batches(evidence,prepared,load_step=load,save_step=save)
    stats={}
    chronology_v2.extract_batches(list(reversed(evidence)),prepared,load_step=load,save_step=save,stats=stats)
    assert calls==[['s1','s2']]
    assert stats['batches_reused']==1

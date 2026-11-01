"""Exercise only the private installation-verification workspace, never customer data."""
import base64
import io
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import uuid
import zipfile

ROOT=Path('/home/coair/coair-secure')
access=json.loads((ROOT/'qualification-access.json').read_text())
origin=access['url']+'/coair-api'
metrics={}
headers={}


def request(path, data=None, method=None, project=True, raw=False, extra=None):
    body=json.dumps(data).encode() if isinstance(data,dict) else data
    h={**headers,**(extra or {})}
    if project:h['X-Project-ID']=access['project_id']
    if isinstance(data,dict):h['Content-Type']='application/json'
    req=urllib.request.Request(origin+path,data=body,headers=h,method=method)
    with urllib.request.urlopen(req,timeout=240) as r:
        blob=r.read()
        return blob if raw else json.loads(blob)


login=request('/auth/login',{'username':access['username'],'password':access['password']},project=False)
assert login.get('access_token') and not login.get('mfa_required')
headers['Authorization']='Bearer '+login['access_token']
metrics['local_login']=True
# A valid owner account from another organization must not be able to query this project.
owner=json.loads((ROOT/'access.json').read_text())
owner_login=request('/auth/login',{'username':owner['username'],'password':owner['password']},project=False)
try:
    request('/files',extra={'Authorization':'Bearer '+owner_login['access_token']})
    raise AssertionError('Cross-organization project was visible')
except urllib.error.HTTPError as exc:
    assert exc.code==404
metrics['cross_organization_access_denied']=True

sample_code='''import base64,io,json
import pymupdf
from openpyxl import Workbook
text="""INSTALLATION VERIFICATION - SYNTHETIC EVIDENCE
12 January 2007: North Works submitted notice NW-001 requesting access to Zone A.
15 January 2007: City Engineering replied that access to Zone A would be provided on 20 January 2007.
20 January 2007: The site register confirmed that Zone A access was available.
Reference: NW-001. Project: Installation verification only.
"""
doc=pymupdf.open();p=doc.new_page();p.insert_textbox((50,50,545,600),text,fontsize=12)
scan=pymupdf.open();sp=scan.new_page();sp.insert_image(sp.rect,stream=p.get_pixmap(dpi=150).tobytes('png'))
w=Workbook();s=w.active;s.append(['Activity','DurationDays']);s.append(['Zone A preparation',5]);s.append(['Site inspection',2]);b=io.BytesIO();w.save(b)
print(json.dumps({'installation-evidence.pdf':base64.b64encode(doc.tobytes()).decode(),
'installation-scanned.pdf':base64.b64encode(scan.tobytes()).decode(),
'installation-table.xlsx':base64.b64encode(b.getvalue()).decode()}))
'''
r=subprocess.run(['docker','exec','coair-secure-secure-api-1','python','-c',sample_code],check=True,capture_output=True,text=True)
samples=json.loads(r.stdout.strip().splitlines()[-1])
files=request('/files')
existing={x['name']:x['id'] for x in files}
ids={}
for name,encoded in samples.items():
    if name in existing:
        ids[name]=existing[name];continue
    boundary='CoairQualification'+uuid.uuid4().hex
    payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+base64.b64decode(encoded)+f'\r\n--{boundary}--\r\n'.encode())
    uploaded=request('/upload',payload,extra={'Content-Type':'multipart/form-data; boundary='+boundary})
    ids[name]=uploaded['file_id']
# Upgrade only this script's own fixtures if they predate review baselines.
for name in ('installation-evidence.pdf','installation-scanned.pdf'):
    if name not in existing:
        continue
    try:
        request('/local/documents/'+ids[name]+'/review')
    except urllib.error.HTTPError as exc:
        if exc.code != 409:
            raise
        request('/files/'+ids[name]+'/reindex', {}, method='POST')
started=time.monotonic()
for _ in range(120):
    states=request('/indexing/status')
    selected=[x for x in states if x['file_id'] in ids.values()]
    if any(x['status']=='failed' for x in selected):
        raise AssertionError('Ingestion failed: '+json.dumps(selected))
    if len(selected)==3 and all(x['status']=='ready' for x in selected):break
    time.sleep(2)
else:raise AssertionError('Ingestion did not finish within 240 seconds')
files=request('/files')
scan=next(x for x in files if x['name']=='installation-scanned.pdf')
# Read through the running API; never open a live DuckDB writer from a second
# process. The review store persists extracted text across process restarts.
review=request('/local/documents/'+ids['installation-scanned.pdf']+'/review')
ocr_text=' '.join(review['pages'].values())
assert 'North Works' in ocr_text and '2007' in ocr_text, 'Scanned source text was not retained'
metrics['three_uploads_ready']=True
metrics['ocr_extracted_text_persisted']=True
assert scan['ocr_pages']==1 and scan['pages']==1, scan
metrics['ocr_display_count']=scan['ocr_pages']
metrics['ingestion_seconds']=round(time.monotonic()-started,2)
# Download resolves a project-owned original, not a stale cloud URL.
assert request('/files/'+ids['installation-evidence.pdf']+'/download',raw=True).startswith(b'%PDF')
metrics['original_document_download']=True
conv=request('/conversations',{'title':'Installation verification'})['conversation_id']
query='Using only the selected notice, provide a dated chronology of the Zone A access events as a Markdown table, with source citations. Preserve the exact dates. Include reference NW-001. Verification run '+uuid.uuid4().hex[:8]
body={'message':query,'conversation_id':conv,'doc_ids':[ids['installation-evidence.pdf']]}
started=time.monotonic();first=None;deltas=[];activities=[];response=None
req=urllib.request.Request(origin+'/chat/stream',data=json.dumps(body).encode(),headers={**headers,'X-Project-ID':access['project_id'],'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=300) as stream:
    for line in stream:
        if not line.startswith(b'data: '):continue
        event=json.loads(line[6:])
        if event['type']=='answer_delta':
            if first is None:first=time.monotonic()-started
            deltas.append(event.get('text',''))
        elif event['type']=='activity':activities.append(event)
        elif event['type']=='error':raise AssertionError('Chat failed: '+json.dumps(event))
        elif event['type']=='complete':response=event['response'];break
assert response, 'No persisted final answer'
answer=response['assistant_text']
assert len(deltas)>1 and first is not None, 'No live final-answer stream'
assert '2007' in answer and '|' in answer and response.get('citations'), response
assert '<think>' not in answer
metrics.update({'stream_deltas':len(deltas),'first_final_delta_seconds':round(first,2),
                'chat_total_seconds':round(time.monotonic()-started,2),'activity_events':len(activities),
                'source_citations':len(response['citations']),'markdown_table':True})
artifacts=ROOT/'qualification-artifacts';artifacts.mkdir(exist_ok=True)
word=request('/chat/document',{'question':query,'answer':answer,'citations':response['citations']},raw=True)
with zipfile.ZipFile(io.BytesIO(word)) as z:
    xml=z.read('word/document.xml');assert b'2007' in xml and b'<w:tbl' in xml
(artifacts/'chat.docx').write_bytes(word)
xlsx=request('/chat/spreadsheet',{'table_columns':['Activity','DurationDays'],'table_rows':[['Zone A preparation',5],['Site inspection',2]]},raw=True)
with zipfile.ZipFile(io.BytesIO(xlsx)) as z:assert 'xl/workbook.xml' in z.namelist()
(artifacts/'table.xlsx').write_bytes(xlsx)
metrics['word_and_excel_downloads']=True
saved=ROOT/'qualification-chronology.json'
if saved.exists():
    previous=json.loads(saved.read_text())
    assert previous['project_id']==access['project_id']
    job=request('/reports/'+previous['job_id'])
else:
    job=request('/chronology/generate',{'topic':'Zone A access events in January 2007','source_doc_ids':[ids['installation-evidence.pdf']]})
job_id=job['job_id'];metrics['chronology_job_id']=job_id
# Save progress before polling so a separate operator can inspect a slow run.
(ROOT/'qualification-progress.json').write_text(json.dumps({'metrics':metrics,'job_id':job_id,'project_id':access['project_id']}))
started=time.monotonic()
for _ in range(180):
    job=request('/reports/'+job_id)
    if job['status']=='ready':break
    if job['status'] in ('failed','cancelled'):raise AssertionError('Chronology failed: '+json.dumps(job))
    time.sleep(2)
else:raise AssertionError('Chronology did not finish within 360 seconds')
report=request('/reports/'+job_id+'/document',raw=True)
with zipfile.ZipFile(io.BytesIO(report)) as z:
    assert b'2007' in z.read('word/document.xml')
(artifacts/'chronology.docx').write_bytes(report)
metrics['chronology_ready']=True;metrics['chronology_seconds']=round(time.monotonic()-started,2)
toolkit=request('/forensic/toolkit-evidence',{'title':'Installation verification findings',
    'methodology':'Evidence-backed fixture verification','findings':['NW-001 records an access request on 12 January 2007.'],
    'source_doc_ids':[ids['installation-evidence.pdf']]})
assert toolkit
metrics['toolkit_evidence_saved']=True
metrics['qualified']=True
(ROOT/'qualification-results.json').write_text(json.dumps(metrics,indent=2))
print(json.dumps(metrics))

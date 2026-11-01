"""DGX pilot acceptance; uploads a fictional image-only PDF to the isolated test project.
Uses the existing developer access file; never prints credentials. Requires the
fixture at /home/coair/protection-build/coair-protected-ocr.pdf. Not a fleet tool.
"""
import io,json,time,urllib.request,uuid,zipfile
from pathlib import Path
c=json.loads(Path('/home/coair/coair-local-access.json').read_text());base=c['url']+'/coair-api'
h={'Content-Type':'application/json'};out=Path('/home/coair/protection-build/acceptance.json');results={}
def save():out.write_text(json.dumps(results,indent=2))
def call(path,body=None,method=None):
 with urllib.request.urlopen(urllib.request.Request(base+path,headers=h,data=json.dumps(body).encode() if body is not None else None,method=method),timeout=600) as r:return json.load(r)
h['Authorization']='Bearer '+call('/auth/login',{'username':c['username'],'password':c['password']})['access_token'];h['X-Project-ID']='cab5c8437f94415c'
results['login']=True
raw=Path('/home/coair/protection-build/coair-protected-ocr.pdf').read_bytes();boundary=uuid.uuid4().hex
body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="protected-runtime-ocr-test.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode()+raw+f'\r\n--{boundary}--\r\n'.encode())
with urllib.request.urlopen(urllib.request.Request(base+'/upload',headers={**h,'Content-Type':'multipart/form-data; boundary='+boundary},data=body),timeout=120) as r:uploaded=json.load(r)
fid=uploaded['file_id'];results['file_id']=fid;save();print(json.dumps({'uploaded_file':fid}),flush=True)
start=time.monotonic()
for _ in range(180):
 status=call('/files/'+fid+'/status')
 if status['status'] in ('ready','failed'):break
 time.sleep(5)
assert status['status']=='ready',status
review=call('/local/documents/'+fid+'/review');text=' '.join(review['pages'].values()).lower()
assert all(s in text for s in ('alice morgan','robert hayes','south wharf','12 april 2007'))
assert review['metadata'].get('date')=='2010-09-20',review['metadata']
results.update(ocr_passed=True,metadata=review['metadata'],ingestion_seconds=round(time.monotonic()-start,2),index_status=status);save();print('OCR, metadata and indexing ready',flush=True)
conv=call('/conversations',{'title':'Protected runtime acceptance'})
start=time.monotonic();chat=call('/chat',{'conversation_id':conv.get('id') or conv.get('conversation_id'),'message':'Who approved the South Wharf cable inspection and on what date? Cite the uploaded record.','doc_ids':[fid]})
results['chat']=chat;results['chat_seconds']=round(time.monotonic()-start,2);save()
answer=chat.get('assistant_text','').lower()
assert 'alice morgan' in answer and '2007' in answer, 'Unexpected chat answer'
assert any(x.get('doc_id')==fid for x in chat.get('citations',[])), 'Missing uploaded source citation'
results['chat_passed']=True;save();print('Cited local chat passed',flush=True)
job=call('/chronology/generate',{'topic':'South Wharf inspection: actual approval and completion events','source_doc_ids':[fid],'parties':['Alice Morgan','Robert Hayes']});results['job_id']=job['job_id'];save();print(json.dumps({'job_id':job['job_id']}),flush=True)
start=time.monotonic()
for _ in range(240):
 result=call('/reports/'+job['job_id'])
 print(json.dumps({k:result.get(k) for k in ('status','stage','progress','error')}),flush=True)
 if result['status'] in ('ready','failed'):break
 time.sleep(5)
results['report']=result;results['chronology_seconds']=round(time.monotonic()-start,2);save()
assert result['status']=='ready',result.get('error')
entries=[e for e in result['result']['entries'] if e.get('event_type')!='overview']
approval=[e for e in entries if any('approved' in x['text'].lower() and 'alice' in x['text'].lower() for x in e['claims'])]
completion=[e for e in entries if any('completed' in x['text'].lower() and 'robert' in x['text'].lower() for x in e['claims'])]
assert approval and all(e['event_date']=='2007-04-12' for e in approval)
assert completion and all(e['event_date']=='2007-04-14' for e in completion)
assert all(not e.get('event_date','').startswith('2026') for e in entries)
with urllib.request.urlopen(urllib.request.Request(base+'/reports/'+job['job_id']+'/document',headers=h),timeout=60) as r:word=r.read()
with zipfile.ZipFile(io.BytesIO(word)) as z:assert z.testzip() is None
Path('/home/coair/protection-build/acceptance.docx').write_bytes(word)
results.update(chronology_passed=True,word_bytes=len(word),acceptance_passed=True);save();print(json.dumps({k:results[k] for k in ('acceptance_passed','ingestion_seconds','chat_seconds','chronology_seconds','word_bytes')}),flush=True)

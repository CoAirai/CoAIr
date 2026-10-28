"""Live staging-only spreadsheet/SQL acceptance; credentials stay on the server.

Run after immutable deployment, then use --cleanup after the browser check.
Creates only one isolated QA project and deletes only its own uploaded file.
"""
import argparse
import base64
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
import urllib.request

ROOT = Path('/opt/coair-integration')
ORIGIN = 'https://coair-test.duckdns.org'
OUTPUT = ROOT/'qualification/quality-parity/table-live.json'


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--commit', required=True)
    parser.add_argument('--cleanup', action='store_true')
    parser.add_argument('--verify-existing', action='store_true');args=parser.parse_args()
    image=subprocess.check_output(['docker','inspect','coair-integration-api-1','--format','{{.Config.Image}}'],text=True).strip()
    assert image.endswith(':'+args.commit), 'Run only against the reviewed immutable staging image'
    access=json.loads((ROOT/'.access.json').read_text())
    passwords=urllib.request.HTTPPasswordMgrWithDefaultRealm()
    passwords.add_password(None,ORIGIN,access['basic_user'],access['basic_password'])
    opener=urllib.request.build_opener(urllib.request.HTTPBasicAuthHandler(passwords),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.open(ORIGIN+'/auth/sign-in').read()
    token=''
    def api(path,data=None,project=None,method=None,ctype=None):
        headers={'Accept':'application/json'}
        if token:headers['Authorization']='Bearer '+token
        if project:headers['X-Project-ID']=project
        if isinstance(data,dict):data=json.dumps(data).encode();headers['Content-Type']='application/json'
        if ctype:headers['Content-Type']=ctype
        with opener.open(urllib.request.Request(ORIGIN+'/coair-api'+path,data=data,headers=headers,method=method),timeout=180) as response:
            body=response.read();return json.loads(body) if body else None
    login=api('/auth/login',{'username':access['app_user'],'password':access['app_password']})
    token=api('/auth/mfa/verify',{'mfa_token':login['mfa_token'],'code':login['debug_code']})['access_token']
    workspace=json.loads((ROOT/'workspace.json').read_text());original_ids={f['id'] for f in api('/files',project=workspace['project_id'])}
    if args.cleanup:
        result=json.loads(OUTPUT.read_text());project=result['project_id']
        if result.get('file_id'):api('/files/'+result['file_id'],project=project,method='DELETE')
        api('/projects/'+project,project=project,method='DELETE')
        result['cleanup']='own file deleted and QA project archived'
        result['original_project_unchanged']=set(result['original_file_ids'])=={f['id'] for f in api('/files',project=workspace['project_id'])}
        OUTPUT.write_text(json.dumps(result,indent=2));print(json.dumps(result));return
    if OUTPUT.exists() and not args.verify_existing and not json.loads(OUTPUT.read_text()).get('cleanup'):
        raise SystemExit('An unfinished QA project exists; inspect it before creating another')
    if args.verify_existing:
        result=json.loads(OUTPUT.read_text());assert not result.get('cleanup')
        project=result['project_id'];fid=result['file_id']
        result.update(commit=args.commit,accepted=False)
        for key in ('conversation_id','empty_conversation_id'):
            if result.get(key):api('/conversations/'+result[key],project=project,method='DELETE')
    else:
        project=api('/projects',{'name':'Structured result acceptance','embedding_profile':'local-bge-v1'})['project_id']
        result={'commit':args.commit,'project_id':project,'accepted':False,'original_file_ids':sorted(original_ids)}
        OUTPUT.write_text(json.dumps(result,indent=2))
        source="""import base64,io,openpyxl
w=openpyxl.Workbook();s=w.active;s.title='Sheet1';s.append(['Month','Amount','Approved'])
for row in [('2026-01',0,False),('2026-02',-12.5,True),('2026-03',1250.75,True)]:s.append(row)
b=io.BytesIO();w.save(b);print(base64.b64encode(b.getvalue()).decode())"""
        payload=base64.b64decode(subprocess.check_output(['docker','exec','-i','coair-integration-api-1','python','-'],input=source,text=True).strip())
        boundary='CoairTableAcceptance'
        body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="quality-costs.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n').encode()+payload+f'\r\n--{boundary}--\r\n'.encode()
        upload=api('/upload',body,project,ctype='multipart/form-data; boundary='+boundary)
        fid=upload['file_id'];result['file_id']=fid;OUTPUT.write_text(json.dumps(result,indent=2))
        for _ in range(90):
            status=api('/files/'+fid+'/status',project=project)['status']
            if status=='ready':break
            assert status not in ('failed','credit_balance_exhausted'),status
            time.sleep(2)
        assert status=='ready'
    conv=api('/conversations',{'title':'Structured monthly cost result'},project)['conversation_id']
    response=api('/chat',{'message':'Show Month, Amount and Approved for every record, ordered by Month. Use the exact stored values, without aggregation or rounding.','conversation_id':conv},project)
    artifact=response.get('sql_artifact');assert artifact, response
    amount=next(c for c in artifact['columns'] if c.lower()=='amount')
    assert sorted(row[amount] for row in artifact['preview_rows'])==[-12.5,0,1250.75],artifact
    assert artifact['row_count']==3
    assert artifact['source_file_id']==fid and artifact['source_file_name']=='quality-costs.xlsx',artifact
    history=api('/conversations/'+conv,project=project)
    assert history['messages'][-1]['response']['sql_artifact']==artifact
    preview=api('/docs/'+fid+'/content',project=project)
    assert preview['type']=='table' and len(preview['rows'])==3,preview
    empty_conv=api('/conversations',{'title':'Structured empty result'},project)['conversation_id']
    empty=api('/chat',{'message':'Show Month and Amount for records where Amount is greater than 999999999. Do not aggregate.','conversation_id':empty_conv},project)
    empty_artifact=empty.get('sql_artifact');assert empty_artifact and empty_artifact['row_count']==0,empty
    assert {c.lower() for c in empty_artifact['columns']} >= {'month','amount'}
    assert not empty_artifact['preview_rows']
    empty_history=api('/conversations/'+empty_conv,project=project)
    assert empty_history['messages'][-1]['response']['sql_artifact']==empty_artifact
    result.update(accepted=True,conversation_id=conv,empty_conversation_id=empty_conv,
        columns=artifact['columns'],rows=artifact['preview_rows'],chart=artifact.get('chart'),
        source_file_id=artifact.get('source_file_id'),history='exact structured artifact retained',
        empty_result='zero rows and original column headings retained',source_table='passed')
    OUTPUT.write_text(json.dumps(result,indent=2));print(json.dumps(result))


if __name__=='__main__':main()

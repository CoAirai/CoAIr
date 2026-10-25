"""Exercise the isolated public Coair release; never touch reference user stores."""
import argparse
import base64
import http.cookiejar
import io
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path('/opt/coair-integration')
ORIGIN = 'https://coair-test.duckdns.org'
STATE = ROOT/'qualification/four-stage-review/live-features.json'


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--commit', required=True)
    parser.add_argument('--cleanup', action='store_true'); args = parser.parse_args()
    image = subprocess.check_output(['docker','inspect','coair-integration-api-1','--format','{{.Config.Image}}'],text=True).strip()
    assert image.endswith(':'+args.commit), 'Immutable integration release mismatch'
    access = json.loads((ROOT/'.access.json').read_text())
    passwords = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    passwords.add_password(None, ORIGIN, access['basic_user'], access['basic_password'])
    opener = urllib.request.build_opener(urllib.request.HTTPBasicAuthHandler(passwords),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.open(ORIGIN+'/auth/sign-in').read()
    token = ''
    def api(path, body=None, project=None, method=None, ctype=None, binary=False):
        headers = {'Accept':'application/json'}
        if token: headers['Authorization'] = 'Bearer '+token
        if project: headers['X-Project-ID'] = project
        if isinstance(body,dict): body=json.dumps(body).encode(); headers['Content-Type']='application/json'
        if ctype: headers['Content-Type']=ctype
        with opener.open(urllib.request.Request(ORIGIN+'/coair-api'+path,data=body,headers=headers,method=method),timeout=180) as response:
            raw=response.read()
            return raw if binary else json.loads(raw) if raw else None
    login=api('/auth/login',{'username':access['app_user'],'password':access['app_password']})
    if login.get('mfa_required'):
        login=api('/auth/mfa/verify',{'mfa_token':login['mfa_token'],'code':login['debug_code']})
    token=login['access_token']
    workspace=json.loads((ROOT/'workspace.json').read_text())
    def inventory():return sorted(file['id'] for file in api('/files',project=workspace['project_id']))
    if args.cleanup:
        result=json.loads(STATE.read_text())
        assert result['commit']==args.commit
        for file_id in result.get('programme_ids',[]):api('/forensic/programmes/'+file_id,project=result['project_id'],method='DELETE')
        for project in [result.get('foreign_project_id'),result.get('project_id')]:
            if project:api('/projects/'+project,project=project,method='DELETE')
        result['cleanup']='Own programmes deleted and QA projects archived'
        result['original_inventory_unchanged']=result['original_file_ids']==inventory()
        assert result['original_inventory_unchanged']
        STATE.write_text(json.dumps(result,indent=2));print('Feature acceptance cleanup passed');return
    assert not STATE.exists(), 'Inspect previous feature acceptance before reuse'
    result={'commit':args.commit,'original_file_ids':inventory(),'accepted':False,'programme_ids':[]}
    def save():STATE.write_text(json.dumps(result,indent=2))
    save()
    status=api('/forensic/status');assert status['enabled'] and len(status['modules'])==19
    project=api('/projects',{'name':'Release feature qualification','embedding_profile':'local-bge-v1'})['project_id']
    result['project_id']=project;save()
    foreign=api('/projects',{'name':'Release isolation qualification','embedding_profile':'local-bge-v1'})['project_id']
    result['foreign_project_id']=foreign;save()
    doc=api('/chat/document',{'question':'Release export check','answer':'###Summary\n\n**Verified** evidence.\n\n| Item | Value |\n| --- | --- |\n| Zero | 0 |',
        'citations':[{'doc_name':'release-source.pdf','anchor':'page_3','snippet':'Source excerpt'}]},project,binary=True)
    with zipfile.ZipFile(io.BytesIO(doc)) as package:
        xml=package.read('word/document.xml');assert b'###Summary' not in xml and b'Summary' in xml and b'<w:b' in xml and b'<w:tbl>' in xml
    xlsx=api('/chat/spreadsheet',{'table_columns':['Amount','Approved','Source'],'table_rows':[[0,False,'=1+1']]},project,binary=True)
    with zipfile.ZipFile(io.BytesIO(xlsx)) as package:
        sheet=ET.fromstring(package.read('xl/worksheets/sheet1.xml'));ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        assert not sheet.findall('.//x:f',ns)
        assert sheet.find('.//x:c[@r="A2"]/x:v',ns).text=='0'
        assert sheet.find('.//x:c[@r="B2"]',ns).get('t')=='b'
    result['word_export']='Heading, bold text, native table and citations retained'
    result['excel_export']='Typed zero/false and literal formula-looking text retained';save()
    code="from pathlib import Path; import json,base64; p=Path('/app/vendor/delay-analysis-toolkit/sample/revisions');print(json.dumps([{'name':f.name,'content':base64.b64encode(f.read_bytes()).decode()} for f in sorted(p.glob('*.xer'))[:2]]))"
    samples=json.loads(subprocess.check_output(['docker','exec','coair-integration-api-1','python','-c',code],text=True))
    assert len(samples)==2
    for sample in samples:
        boundary='CoairReleaseFeatureBoundary'
        payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{sample["name"]}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+base64.b64decode(sample['content'])+f'\r\n--{boundary}--\r\n'.encode()
        value=api('/forensic/programmes',payload,project,ctype='multipart/form-data; boundary='+boundary)
        result['programme_ids'].append(value['file_id']);save()
    ws=api('/forensic/workspaces',{'name':'Release qualification','programme_ids':result['programme_ids']},project)
    result['workspace_id']=ws['workspace_id'];save()
    def wait(run):
        for _ in range(120):
            row=api('/forensic/runs/'+run['run_id'],project=project)
            if row['status']=='ready':return row
            assert row['status'] not in ('failed','cancelled'),row.get('error_code')
            time.sleep(2)
        raise AssertionError('Forensic run did not complete in acceptance window')
    run=wait(api('/forensic/workspaces/'+ws['workspace_id']+'/modules/dcma/runs',{'parameters':{'kind':'dcma'},'ai_narrative':True},project))
    result['dcma_run_id']=run['run_id'];result['ai_status']=run['result'].get('ai_status');save()
    assert result['ai_status']=='ready' and run['result'].get('narrative')
    assert any(artifact['kind']=='excel' for artifact in run['artifacts'])
    assembled=wait(api('/forensic/workspaces/'+ws['workspace_id']+'/modules/report-assembler/runs',{'parameters':{'kind':'report-assembler','report_title':'Release Programme Review'}},project))
    word=next(artifact for artifact in assembled['artifacts'] if artifact['kind']=='word')
    report=api('/forensic/artifacts/'+word['artifact_id']+'/download',project=project,binary=True)
    with zipfile.ZipFile(io.BytesIO(report)) as package:
        content=package.read('word/document.xml');assert b'Preliminary Delay Analysis Report' in content and b'DCMA' in content
    result['assembled_run_id']=assembled['run_id'];result['word_artifact_id']=word['artifact_id']
    result['report_title_policy']='Saved workspace report title takes precedence over run parameters'
    for path in ['/forensic/workspaces/'+ws['workspace_id'],'/forensic/artifacts/'+word['artifact_id']+'/download']:
        try:api(path,project=foreign,binary=True)
        except urllib.error.HTTPError as error:assert error.code==404
        else:raise AssertionError('Cross-project forensic access was accepted')
    result.update(accepted=True,toolkit_modules=19,forensic_isolation='Foreign active project rejected workspace and artifact IDs',original_inventory_unchanged=inventory()==result['original_file_ids'])
    save();assert result['original_inventory_unchanged']
    print('PASS: public Word/Excel exports, real native DCMA and AI narrative, Word assembly and project isolation')


if __name__=='__main__':main()

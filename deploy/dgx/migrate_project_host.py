"""Run on the DGX host. Never print runtime credentials."""
import json
from pathlib import Path
import subprocess
import sys
import shutil

ROOT=Path('/home/coair/coair-secure')
STATE=ROOT/'edinburgh-migration-state.json'
SCRIPT=ROOT/'migrate_project.py'
NAME='coair-project-migration'
SOURCE_API='coair-local-api-1'
TARGET_API='coair-secure-secure-api-1'


def docker(*args,**kw):
    return subprocess.run(['docker',*args],check=True,capture_output=True,text=True,**kw)


def inspect(name):
    row=json.loads(docker('inspect',name).stdout)[0]
    return row,dict(x.split('=',1) for x in row['Config']['Env'] if '=' in x)


def phase(name,settings):
    image=inspect(TARGET_API)[0]['Config']['Image']
    docker('create','-i','--name',NAME,'--network','coair-local_data','--user','0:0',
           '--volumes-from',TARGET_API,
           '-v','coair-local_storage:/source/storage:ro',
           '-v','coair-local_documents:/source/data:ro',
           '-v',str(SCRIPT)+':/migration.py:ro','--entrypoint','python',image,'/migration.py',name)
    try:
        docker('network','connect','coair-secure_data',NAME)
        r=subprocess.run(['docker','start','-ai',NAME],input=json.dumps(settings),capture_output=True,text=True)
        if r.returncode:
            print(r.stderr[-2500:]);print(r.stdout[-1500:]);raise RuntimeError('Migration phase failed: '+name)
        line=next(x for x in r.stdout.splitlines() if x.startswith('MIGRATION_RESULT='))
        return json.loads(line.split('=',1)[1])
    finally:docker('rm','-f',NAME)


def main():
    source,source_env=inspect(SOURCE_API);target,target_env=inspect(TARGET_API)
    if not source['State']['Running'] or not target['State']['Running']:raise RuntimeError('Both original APIs must be healthy before import')
    if shutil.disk_usage(ROOT).free<6*1024**3:raise RuntimeError('Insufficient disk space')
    access=json.loads((ROOT/'access.json').read_text())
    original_access=json.loads(Path('/home/coair/coair-local-access.json').read_text())
    if original_access['username'] != access['username']:raise RuntimeError('Account mapping requires review')
    if any(source_env.get(k) != target_env.get(k) for k in ('EMBEDDING_API_URL','EMBEDDING_API_KEY')):raise RuntimeError('Embedding configuration mismatch')
    # Confirm visibility with the source application's normal authorization path.
    import urllib.request
    old_origin='http://100.91.121.116:8080/coair-api'
    request=urllib.request.Request(old_origin+'/auth/login',data=json.dumps({'username':original_access['username'],'password':original_access['password']}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=30) as response: token=json.load(response)['access_token']
    request=urllib.request.Request(old_origin+'/projects',headers={'Authorization':'Bearer '+token})
    with urllib.request.urlopen(request,timeout=30) as response: rows=json.load(response)
    if isinstance(rows,dict):rows=rows['projects']
    source_project=next((row for row in rows if row['project_id']=='9526e46f951947d1'),None)
    if not source_project or source_project.get('embedding_profile')!='local-bge-v1':raise RuntimeError('Source project authorization/profile failed')
    settings={'source_env':source_env,'target_env':target_env,'owner':access['username']}
    state=json.loads(STATE.read_text()) if STATE.exists() else {}
    def save():STATE.write_text(json.dumps(state))
    if 'originals' not in state:
        state.update(phase('files',settings));save()
        print(json.dumps({'originals_copied_and_hashed':state['originals'],'auxiliary_files':state['auxiliary_files']}),flush=True)
    if 'vectors' not in state:
        state.update(phase('vectors',settings));save()
        print(json.dumps({'scoped_vectors_copied':state['vectors']}),flush=True)
    if '--apply' in sys.argv and 'published_project' not in state:
        # DuckDB permits one writer. Stop both writers before opening those files;
        # all source mounts stay read-only, and restart the original even on error.
        docker('stop','--time','30',SOURCE_API,TARGET_API)
        try:
            settings['state']=state
            state.update(phase('finalize',settings));save()
        finally:
            docker('start',SOURCE_API,TARGET_API)
    print(json.dumps({k:v for k,v in state.items() if k not in ('page_stats','catalog_entries')}),flush=True)


if __name__=='__main__':main()

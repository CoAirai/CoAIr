"""Provision an owner without printing passwords or changing existing accounts."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess

PROVISION = '''import json,sys
import coair_protected
coair_protected.activate()
from src.user_store import get_user_store
from src.org_store import get_org_store
from src.project_store import get_project_store
from src.ops_store import get_ops_store
p=json.load(sys.stdin)
s=get_user_store()
u=s.get_user(p['username'])
if u:
    assert s.verify_password(p['username'],p['password']), 'Existing account password differs; no reset performed'
else:
    s.create_user(p['username'],p['password'],display_name=p['display_name'],role='user',token_limit=0,
                  plan_type='legacy',features={'chat':True,'chronology':True,'forensic':True,'notify_email':False})
o=get_org_store()
m=o.membership_for(p['username'])
org_id=m['org_id'] if m else o.create_org(p['organization'],created_by=p['username'],owner=p['username'],
                 default_plan_type='legacy',default_token_limit=0)['org_id']
for module in ('chronology','forensic'):
    get_ops_store().set_org_module_grant(org_id,module,True)
projects=get_project_store()
rows=projects.list_for_user(p['username'])
project=next((r for r in rows if r['name']==p['project_name']),None)
if not project:
    project=projects.create_project(p['project_name'],p['username'],org_id=org_id)
print(json.dumps({'project_id':project['project_id'],'org_id':org_id}))
'''


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--root',type=Path,default=Path('/home/coair/coair-secure'))
    p.add_argument('--qualification',action='store_true')
    a=p.parse_args()
    os.umask(0o077)
    target=a.root/('qualification-access.json' if a.qualification else 'access.json')
    if target.exists():
        print('Existing access record preserved; no account reset.')
        return
    if a.qualification:
        account={'username':'qualification-'+secrets.token_hex(6),'password':secrets.token_urlsafe(24)}
    else:
        account=json.loads(Path('/home/coair/coair-local-access.json').read_text())
        if len(account['password'])<12:
            account['password']=secrets.token_urlsafe(24)
    payload={**account,'display_name':'Installation verification' if a.qualification else 'Local administrator',
             'organization':'Installation verification' if a.qualification else 'Local workspace',
             'project_name':'Evidence checks' if a.qualification else 'Documents'}
    r=subprocess.run(['docker','exec','-i','coair-secure-secure-api-1','python','-c',PROVISION],
                     input=json.dumps(payload),capture_output=True,text=True)
    if r.returncode:
        raise RuntimeError('Provisioning failed without resetting credentials: '+r.stderr[-1200:])
    result=json.loads(r.stdout.strip().splitlines()[-1])
    target.write_text(json.dumps({'url':'http://100.91.121.116:18082',
                                 'username':account['username'],'password':account['password'],**result}))
    target.chmod(0o600)
    print(json.dumps({'account_provisioned':True,'qualification':a.qualification,
                      'private_access_record':str(target)}))


if __name__=='__main__':
    main()

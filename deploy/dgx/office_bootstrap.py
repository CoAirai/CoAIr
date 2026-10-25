"""Inside protected office API, bootstrap one operator and company on EMPTY DB."""
import json,os,secrets,sys
sys.path.insert(0,'/app')
output=sys.stdout;sys.stdout=sys.stderr
import coair_protected
coair_protected.activate()
from src.database import apply_core_schema
from src.user_store import get_user_store
from src.org_store import get_org_store
from src.ops_store import get_ops_store
from src.appliance_access import provision_personal_access
apply_core_schema();users=get_user_store();orgs=get_org_store()
if users.list_users(): raise SystemExit('Refusing to bootstrap a populated database')
company=os.environ['COAIR_COMPANY_NAME'];owner=os.environ['COAIR_COMPANY_OWNER']
operator_password=secrets.token_urlsafe(24);owner_password=secrets.token_urlsafe(24)
users.create_user('device-operator',operator_password,role='superadmin')
users.create_user(owner,owner_password,is_active=False,features={'download':True,'chronology':True,'forensic':True})
org=orgs.create_org(company,created_by='device-operator',owner=owner,default_storage_bytes=5000000000,
                    default_token_limit=1000000,allow_member_projects=True)
for module in ['chronology','forensic']:get_ops_store().set_org_module_grant(org['org_id'],module,True)
record=provision_personal_access(users,orgs,owner,'office')
print(json.dumps({'device-operator':{'password':operator_password},owner:{'password':owner_password,'project_id':record['personal_project_id']}}),file=output)

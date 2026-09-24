"""Create the initial local company account, without resetting existing users."""
import getpass
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.user_store import get_user_store
from src.org_store import get_org_store
from src.project_store import get_project_store

if os.getenv('DEPLOYMENT_MODE') != 'local':
    raise SystemExit('Only available in local deployment mode')
username = input('Administrator username/email: ').strip()
password = getpass.getpass('Password (at least 12 characters): ')
if not username or len(password) < 12:
    raise SystemExit('Username and a password of at least 12 characters are required')
store = get_user_store()
if store.get_user(username):
    raise SystemExit('Account exists; nothing changed')
store.create_user(username, password, display_name='Local administrator', role='user',
                  token_limit=0, features={'chat': True, 'chronology': True, 'forensic': True})
org = get_org_store().create_org('Local workspace', created_by=username, owner=username,
                                default_plan_type='legacy', default_token_limit=0)
project = get_project_store().create_project('Documents', owner=username, org_id=org['org_id'])
print('Local company administrator created; project:', project['project_id'])

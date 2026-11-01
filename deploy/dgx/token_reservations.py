#!/usr/bin/env python3
"""Root operator reconciliation of unconfirmed provider usage. Never guesses usage."""
import argparse,json,os,re,subprocess
from datetime import datetime,timezone
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--database-container',choices=['coair-demo-db-1','coair-office-db-1'],required=True)
sub=p.add_subparsers(dest='action',required=True);sub.add_parser('list')
r=sub.add_parser('settle');r.add_argument('--reservation-id',required=True)
r.add_argument('--confirmed-tokens',type=int,required=True);r.add_argument('--note',required=True)
a=p.parse_args()
if os.geteuid()!=0:raise SystemExit('Only the device operator may reconcile token usage')
if a.action=='list':
 sql="SELECT COALESCE(json_agg(r),'[]'::json) FROM appliance_token_reservations r"
else:
 if not re.fullmatch('[a-f0-9]{32}',a.reservation_id) or a.confirmed_tokens<0 or not a.note.strip():raise SystemExit('Invalid reconciliation')
 # Persist operator intent BEFORE changing usage. Duplicate settlement is harmless.
 log=Path('/etc/coair/token-reconciliation.jsonl');log.parent.mkdir(parents=True,exist_ok=True)
 fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
 with os.fdopen(fd,'w') as out:
  out.write(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'database':a.database_container,
    'reservation_id':a.reservation_id,'confirmed_tokens':a.confirmed_tokens,'note':a.note})+'\n');out.flush();os.fsync(out.fileno())
 sql=f"WITH r AS (DELETE FROM appliance_token_reservations WHERE reservation_id='{a.reservation_id}' RETURNING *) UPDATE appliance_token_usage u SET reserved=u.reserved-r.amount,used=u.used+{a.confirmed_tokens} FROM r WHERE u.username=r.username AND u.period=r.period RETURNING json_build_object('username',u.username,'used',u.used,'reserved',u.reserved)"
result=subprocess.run(['docker','exec',a.database_container,'psql','-v','ON_ERROR_STOP=1','-U','coair','-d','coair','-Atc',sql],check=True,capture_output=True,text=True)
print(result.stdout.strip())

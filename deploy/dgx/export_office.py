#!/usr/bin/env python3
"""Build one current clean delivery on DGX. No customer data/secrets/dev images."""
import argparse,hashlib,json,shutil,subprocess,tarfile
from pathlib import Path
import yaml
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True)
p.add_argument('--model-directory',type=Path,required=True)
p.add_argument('--refresh-images',action='store_true',help='Replace current verified image bundle; retain the existing pinned model archive')
p.add_argument('--api-image',default='coair-api:protected-20261002-demo-pilot')
p.add_argument('--web-image',default='coair-web:demo-pilot')
p.add_argument('--model-image',default='vllm/vllm-openai')
a=p.parse_args();here=Path(__file__).resolve().parent;out=a.output
if out.exists() and any(out.iterdir()) and not a.refresh_images:raise SystemExit('Delivery directory already populated; use --refresh-images to update the same package')
if a.refresh_images:
 old=json.loads((out/'manifest.json').read_text())
 if old.get('model_revision')!='1355db6a052410cfd62085d94b58866fd0f2c3c5':raise SystemExit('Pinned model differs; refusing refresh')
 h=hashlib.sha256()
 with (out/'model.tar').open('rb') as stream:
  while block:=stream.read(1048576):h.update(block)
 if h.hexdigest()!=old['files']['model.tar']:raise SystemExit('Existing model archive integrity failed')
out.mkdir(parents=True,exist_ok=True)
images=[a.api_image,a.web_image,'coair-embedding:dgx-local','postgres:16-bookworm','qdrant/qdrant:v1.15.4','nginx:1.28-alpine',a.model_image]
pinned={image:json.loads(subprocess.check_output(['docker','image','inspect',image]))[0] for image in images}
needed=sum(item['Size'] for item in pinned.values())+sum(f.stat().st_size for f in a.model_directory.iterdir() if f.is_file())
if shutil.disk_usage(out).free<needed*1.2:raise SystemExit('Not enough disk space for one current delivery')
compose=yaml.safe_load((here/'compose.yaml').read_text());compose['name']='coair-office'
for service in compose['services'].values():service.pop('build',None)
api=compose['services']['api'];api['image']=pinned[a.api_image]['Id'];api['env_file']='.env'
api['environment'].update(COAIR_ACCESS_PLAN='office',COAIR_SHARED_INBOX_ENABLED='0',COAIR_ADMISSION_DATABASE='/app/admission/chat.db',
 UPLOAD_MAX_BYTES='100000000',INGEST_MAX_CONCURRENCY='1',LOCAL_METADATA_CONCURRENCY='1',OCR_MAX_WORKERS='1',REPORT_MAX_CONCURRENCY='1',
 LLM_MODEL='qwen3.6-35b-a3b',LLM_CONTEXT_TOKENS='131072',LLM_LOCAL_OUTPUT_TOKENS='32768')
api['volumes']=[v for v in api['volumes'] if not v.endswith(':/import:ro')]+['admission:/app/admission',
 './protection-secrets/device.key:/run/secrets/coair-protection.key:ro','./protection-secrets/license.json:/run/secrets/coair-license.json:ro',
 '/etc/machine-id:/run/coair-machine-id:ro']
compose['services']['web']['image']=pinned[a.web_image]['Id']
for service in ['embedding','db','qdrant','gateway','model-proxy']:
 old=compose['services'][service]['image'];compose['services'][service]['image']=pinned[old]['Id']
compose['services']['model-proxy']['environment']['MODEL_UPSTREAM']='http://vllm:8000'
compose['services']['vllm']={'image':pinned[a.model_image]['Id'],'platform':'linux/arm64','restart':'unless-stopped','gpus':'all',
 'shm_size':'8gb','entrypoint':['python3','/opt/coair/office_model.py'],
 'environment':{'VLLM_API_KEY':'${LLM_API_KEY:?Run office installer}','HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1',
 'HF_HUB_DISABLE_TELEMETRY':'1','VLLM_NO_USAGE_STATS':'1','DO_NOT_TRACK':'1'},
 'volumes':['./models:/models:ro','./office_model.py:/opt/coair/office_model.py:ro','vllm-cache:/root/.cache/vllm'],'networks':['model'],
 'healthcheck':{'test':['CMD','python3','-c','import urllib.request;urllib.request.urlopen("http://127.0.0.1:8000/health",timeout=4)'],
 'interval':'30s','timeout':'5s','retries':5,'start_period':'20m'}}
compose['networks']['model']={'internal':True}
compose['services']['gateway']['ports']=['127.0.0.1:8080:80','${LAN_BIND_ADDRESS:?Set office LAN IP}:443:443']
compose['services']['gateway']['volumes']=['./nginx.office.conf:/etc/nginx/conf.d/default.conf:ro','./tls:/run/coair-tls:ro']
compose['volumes']['admission']={'name':'coair-chat-admission'};compose['volumes']['vllm-cache']={}
(out/'compose.office.json').write_text(json.dumps(compose,indent=2))
for name in ['office_model.py','office_install.py','office_bootstrap.py','nginx.office.conf','model-proxy.conf.template',
 'backup_restore.py','token_reservations.py','install_tunnel.py','tunnel_accounts.py','sshd-tunnel.conf.template',
 'coair-tunnel.service','coair-tunnel-expire.service','coair-tunnel-expire.timer','network_guard.sh','coair-network-guard.service',
 'tailscale-policy.hujson','USER_GUIDE.md','OPERATOR_GUIDE.md']:
 shutil.copy2(here/name,out/name)
shutil.copy2(here/'protection/check.py',out/'protected_check.py')
with (out/'images.tar').open('wb') as stream:subprocess.run(['docker','save',*images],stdout=stream,check=True)
if not a.refresh_images:
 with tarfile.open(out/'model.tar','w',dereference=True) as tar:tar.add(a.model_directory,arcname='models')
manifest={'model_revision':'1355db6a052410cfd62085d94b58866fd0f2c3c5','images':{name:item['Id'] for name,item in pinned.items()},
 'customer_data_included':False,'secrets_included':False,'application_source_included':False}
# Public operational scripts are intended; protected application's source is absent.
manifest['files']={}
for file in out.iterdir():
 if not file.is_file() or file.name=='manifest.json':continue
 digest=hashlib.sha256()
 with file.open('rb') as stream:
  while block:=stream.read(1048576):digest.update(block)
 manifest['files'][file.name]=digest.hexdigest()
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
subprocess.run(['python3',str(here/'protection/audit_image.py'),str(out/'images.tar')],check=True)
print(json.dumps({'delivery':str(out),'images':len(images),'clean':True}))

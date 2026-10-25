#!/usr/bin/env python3
"""Operator-only clean installation. Existing directories/data are preserved."""
import argparse,hashlib,ipaddress,json,os,shutil,socket,subprocess,tarfile
from pathlib import Path
import secrets
p=argparse.ArgumentParser();p.add_argument('--package',type=Path,required=True);p.add_argument('--directory',type=Path,required=True)
p.add_argument('--hostname',required=True);p.add_argument('--lan-ip',required=True)
p.add_argument('--certificate',type=Path,required=True);p.add_argument('--certificate-key',type=Path,required=True)
p.add_argument('--protection-directory',type=Path,required=True)
p.add_argument('--company-name',required=True);p.add_argument('--company-owner',required=True)
p.add_argument('--validate-only',action='store_true');a=p.parse_args()
if os.geteuid()!=0:raise SystemExit('Run as the device operator')
if subprocess.check_output(['uname','-m'],text=True).strip()!='aarch64':raise SystemExit('DGX Spark ARM64 required')
if not a.company_owner or a.company_owner=='device-operator':raise SystemExit('Use a distinct company owner username')
address=ipaddress.ip_address(a.lan_ip)
if address.version!=4 or not address.is_private or address.is_loopback:raise SystemExit('Use a private office LAN IPv4 address')
if a.directory.exists():raise SystemExit('Refusing to overwrite an existing installation directory')
for name in ['device.key','license.json']:
 if not (a.protection_directory/name).is_file():raise SystemExit('Per-device operator protection credentials are required')
identity=subprocess.run(['openssl','x509','-in',str(a.certificate),'-noout','-checkhost',a.hostname],check=True,capture_output=True,text=True)
if 'does match certificate' not in identity.stdout:raise SystemExit('TLS certificate does not match the office hostname')
subprocess.run(['openssl','x509','-in',str(a.certificate),'-noout','-checkend','604800'],check=True,capture_output=True)
public=subprocess.check_output(['openssl','x509','-in',str(a.certificate),'-pubkey','-noout'])
private_public=subprocess.check_output(['openssl','pkey','-in',str(a.certificate_key),'-pubout'])
if public!=private_public:raise SystemExit('TLS certificate and key do not match')
manifest=json.loads((a.package/'manifest.json').read_text())
for name,expected in manifest['files'].items():
 digest=hashlib.sha256()
 with (a.package/name).open('rb') as stream:
  while block:=stream.read(1048576):digest.update(block)
 if digest.hexdigest()!=expected:raise SystemExit('Delivery checksum mismatch: '+name)
needed=(a.package/'model.tar').stat().st_size+sum(subprocess.run(['docker','image','inspect',i],capture_output=True).returncode!=0 for i in manifest['images'].values())*(a.package/'images.tar').stat().st_size
if shutil.disk_usage(a.directory.parent).free<needed+20_000_000_000:raise SystemExit('Insufficient installation disk space')
for ip,port in [('127.0.0.1',8080),(a.lan_ip,443)]:
 with socket.socket() as sock:sock.bind((ip,port))
if a.validate_only:
 print('Package checksums, architecture, TLS identity/key, space and ports validated; no installation changed.');raise SystemExit(0)
a.directory.mkdir(mode=0o700)
for item in a.package.iterdir():
 if item.is_file() and item.suffix!='.tar':shutil.copy2(item,a.directory/item.name)
subprocess.run(['docker','load','-i',str(a.package/'images.tar')],check=True,stdout=subprocess.DEVNULL)
with tarfile.open(a.package/'model.tar') as tar:
 for member in tar.getmembers():
  if not (a.directory/member.name).resolve().is_relative_to(a.directory.resolve()) or not (member.isfile() or member.isdir()):raise SystemExit('Unsafe model archive')
 tar.extractall(a.directory)
for dirname in ['tls','protection-secrets']:(a.directory/dirname).mkdir(mode=0o700)
for source,dest in [(a.certificate,'tls/certificate.pem'),(a.certificate_key,'tls/key.pem'),
 (a.protection_directory/'device.key','protection-secrets/device.key'),(a.protection_directory/'license.json','protection-secrets/license.json')]:
 shutil.copy2(source,a.directory/dest);(a.directory/dest).chmod(0o600)
values={'POSTGRES_PASSWORD':secrets.token_hex(32),'QDRANT_API_KEY':secrets.token_hex(32),'EMBEDDING_API_KEY':secrets.token_hex(32),
 'JWT_SECRET':secrets.token_hex(48),'LLM_API_KEY':secrets.token_hex(48),'LAN_BIND_ADDRESS':a.lan_ip,'COAIR_ACCESS_PLAN':'office',
 'DEPLOYMENT_MODE':'local','AUTH_PROVIDER':'local','EMAIL_DELIVERY_MODE':'dry-run','SMTP_HOST':'','RESEND_API_KEY':'',
 'LOCAL_METADATA_ENABLED':'true'}
env=a.directory/'.env';env.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));env.chmod(0o600)
compose=['docker','compose','--project-directory',str(a.directory),'-f',str(a.directory/'compose.office.json'),'--env-file',str(env)]
# Fail the device license check before touching a database.
subprocess.run(compose+['run','--rm','--no-deps','-v',str(a.directory/'protected_check.py')+':/check.py:ro','--entrypoint','python','api','/check.py'],check=True)
subprocess.run(compose+['up','-d','--wait','db'],check=True)
fd=os.open(a.directory/'operator-access.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as out:
 subprocess.run(compose+['run','--rm','--no-deps','-e','COAIR_COMPANY_NAME='+a.company_name,'-e','COAIR_COMPANY_OWNER='+a.company_owner,
  '-v',str(a.directory/'office_bootstrap.py')+':/bootstrap.py:ro','--entrypoint','python','api','/bootstrap.py'],stdout=out,check=True)
# First model startup may take 20 minutes; status is independently observable.
subprocess.run(compose+['up','-d','--no-build'],check=True)
print(json.dumps({'company_url':'https://'+a.hostname+'/auth/sign-in','credentials_file':str(a.directory/'operator-access.json'),
 'next':'Wait for health checks, install host network guard, then run customer acceptance. Do not distribute device-operator credentials.'}))

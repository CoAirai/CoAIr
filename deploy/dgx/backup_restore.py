#!/usr/bin/env python3
"""Operator-only encrypted appliance backup and disposable restore verification.
No signing key is included. Existing databases/volumes are never overwritten.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MAGIC = b'COAIRBACKUP1\n'
VOLUMES = ('documents','storage','qdrant')

def run(args, **kw):
    return subprocess.run(args,check=True,capture_output=True,**kw)

def mountpoint(volume):
    return Path(run(['docker','volume','inspect','-f','{{.Mountpoint}}',volume],text=True).stdout.strip())

def inventory(root):
    result={}
    for file in sorted(root.rglob('*')):
        if file.is_symlink(): raise RuntimeError('Unexpected symlink in application volume')
        if file.is_file():
            digest=hashlib.sha256()
            with file.open('rb') as stream:
                while block:=stream.read(1048576): digest.update(block)
            result[str(file.relative_to(root))]={'size':file.stat().st_size,'sha256':digest.hexdigest()}
    return result

def file_hash(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        while block:=stream.read(1048576): digest.update(block)
    return digest.digest()

def key_bytes(path, create=False):
    if create and not path.exists():
        path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as stream: stream.write(os.urandom(32))
    if path.stat().st_mode & 0o077: raise RuntimeError('Backup key must be mode 0600')
    key=path.read_bytes()
    if len(key)!=32: raise RuntimeError('Expected a 32-byte backup key')
    return key

def encrypt(source,dest,key):
    nonce=os.urandom(12)
    enc=Cipher(algorithms.AES(key),modes.GCM(nonce)).encryptor()
    enc.authenticate_additional_data(MAGIC)
    with source.open('rb') as plain,dest.open('wb') as out:
        out.write(MAGIC+nonce)
        while block:=plain.read(1048576): out.write(enc.update(block))
        out.write(enc.finalize()); out.write(enc.tag)
    dest.chmod(0o600)

def decrypt(source,dest,key):
    with source.open('rb') as stream:
        if stream.read(len(MAGIC))!=MAGIC: raise RuntimeError('Unknown backup format')
        nonce=stream.read(12); stream.seek(-16,2); tag=stream.read(16)
        remaining=stream.tell()-16-len(MAGIC)-12
        stream.seek(len(MAGIC)+12)
        dec=Cipher(algorithms.AES(key),modes.GCM(nonce,tag)).decryptor()
        dec.authenticate_additional_data(MAGIC)
        with dest.open('wb') as out:
            while remaining:
                block=stream.read(min(1048576,remaining))
                if not block: raise RuntimeError('Truncated encrypted backup')
                out.write(dec.update(block)); remaining-=len(block)
            out.write(dec.finalize())  # Authentication completes BEFORE extraction.
    dest.chmod(0o600)

def counts(container):
    sql="SELECT json_build_object('users',(SELECT count(*) FROM users),'projects',(SELECT count(*) FROM projects),'storage_objects',(SELECT count(*) FROM storage_objects),'organizations',(SELECT count(*) FROM organizations),'usage_rows',(SELECT count(*) FROM appliance_token_usage))"
    return json.loads(run(['docker','exec',container,'psql','-U','coair','-d','coair','-Atc',sql],text=True).stdout)

def safe_extract(archive,root):
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            target=(root/member.name).resolve()
            if not target.is_relative_to(root.resolve()) or not (member.isfile() or member.isdir()):
                raise RuntimeError('Unsafe backup member')
        tar.extractall(root)

def backup(args,key,stage):
    project=args.project
    db=f'{project}-db-1'
    api=f'{project}-api-1'; qdrant=f'{project}-qdrant-1'
    stopped=[]
    try:
        for name in [api,qdrant]:
            if run(['docker','inspect','-f','{{.State.Running}}',name],text=True).stdout.strip()=='true':
                run(['docker','stop','--time','90',name]); stopped.append(name)
        manifest={'format':1,'project':project,'counts':counts(db),'volumes':{}}
        with (stage/'database.dump').open('wb') as out:
            subprocess.run(['docker','exec',db,'pg_dump','-U','coair','-d','coair','-Fc'],stdout=out,check=True)
        for kind in VOLUMES:
            source=mountpoint(f'{project}_{kind}')
            manifest['volumes'][kind]=inventory(source)
        (stage/'manifest.json').write_text(json.dumps(manifest))
        config=stage/'configuration'; config.mkdir()
        for path in args.configuration:
            source=Path(path)
            if not source.is_file(): raise RuntimeError(f'Missing configuration: {source.name}')
            if source.name in ('signing.key','signing.pem'): raise RuntimeError('Signing key cannot be backed up here')
            if (config/source.name).exists(): raise RuntimeError('Duplicate configuration name')
            shutil.copy2(source,config/source.name)
        plain=stage/'payload.tar'
        with tarfile.open(plain,'w') as tar:
            for name in ['database.dump','manifest.json','configuration']: tar.add(stage/name,arcname=name)
            for kind in VOLUMES: tar.add(mountpoint(f'{project}_{kind}'),arcname=f'volumes/{kind}')
        target=Path(args.output); target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        temporary=target.with_suffix('.pending')
        encrypt(plain,temporary,key)
        # Verify authentication before replacing the current backup.
        decrypt(temporary,stage/'verified.tar',key)
        if file_hash(plain)!=file_hash(stage/'verified.tar'):
            raise RuntimeError('Encrypted backup round-trip differs')
        temporary.replace(target)
        print(json.dumps({'backup':str(target),'encrypted':True,'counts':manifest['counts']}))
    finally:
        for name in reversed(stopped): run(['docker','start',name])

def restore_check(args,key,stage):
    decrypt(Path(args.input),stage/'verified.tar',key)
    root=stage/'restored'; root.mkdir(); safe_extract(stage/'verified.tar',root)
    manifest=json.loads((root/'manifest.json').read_text())
    prefix='coair-restore-check-'+os.urandom(5).hex()
    volumes=[]; container=prefix+'-db'
    try:
        for kind in VOLUMES:
            name=prefix+'-'+kind
            run(['docker','volume','create',name]); volumes.append(name)
            dest=mountpoint(name)
            shutil.copytree(root/'volumes'/kind,dest,dirs_exist_ok=True)
            if inventory(dest)!=manifest['volumes'][kind]: raise RuntimeError(f'{kind} restore mismatch')
        dbvol=prefix+'-postgres'; run(['docker','volume','create',dbvol]); volumes.append(dbvol)
        run(['docker','run','-d','--name',container,'--network','none','-e','POSTGRES_USER=coair',
             '-e','POSTGRES_DB=coair','-e','POSTGRES_HOST_AUTH_METHOD=trust','-v',dbvol+':/var/lib/postgresql/data',
             'postgres:16-bookworm'])
        import time
        for _ in range(60):
            if subprocess.run(['docker','exec',container,'pg_isready','-U','coair','-d','coair'],capture_output=True).returncode==0: break
            time.sleep(1)
        else: raise RuntimeError('Restore database startup failed')
        with (root/'database.dump').open('rb') as source:
            subprocess.run(['docker','exec','-i',container,'pg_restore','--exit-on-error','-U','coair','-d','coair'],stdin=source,check=True,capture_output=True)
        result=counts(container)
        if result!=manifest['counts']: raise RuntimeError('Database record count mismatch')
        print(json.dumps({'restore_verified':True,'counts':result,'volume_hashes_verified':list(VOLUMES),
                          'production_overwritten':False}))
    finally:
        subprocess.run(['docker','rm','-f',container],capture_output=True)
        for name in volumes: subprocess.run(['docker','volume','rm',name],capture_output=True)


def main():
    if os.geteuid()!=0: raise SystemExit('Run as the Linux device operator')
    p=argparse.ArgumentParser(); p.add_argument('--key',type=Path,required=True)
    sub=p.add_subparsers(dest='action',required=True)
    b=sub.add_parser('backup'); b.add_argument('--project',choices=['coair-demo','coair-office'],required=True)
    b.add_argument('--output',required=True); b.add_argument('--configuration',nargs='*',default=[])
    r=sub.add_parser('restore-check'); r.add_argument('--input',required=True)
    args=p.parse_args(); key=key_bytes(args.key,args.action=='backup')
    with tempfile.TemporaryDirectory(prefix='coair-backup-') as directory:
        stage=Path(directory); stage.chmod(0o700)
        (backup if args.action=='backup' else restore_check)(args,key,stage)

if __name__=='__main__': main()

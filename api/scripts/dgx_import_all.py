#!/usr/bin/env python3
"""Submit a complete appliance inbox and persist source-by-source progress.

Run on the DGX host (stdlib only). Credentials remain in their owner-only file.
The API's durable queue continues if this monitoring process or SSH disconnects.
"""
import argparse
import json
import time
import urllib.request
from collections import Counter
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--credentials', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--monitor-only', action='store_true')
    args = parser.parse_args()
    credentials = json.loads(args.credentials.read_text())
    base = credentials['url'].rstrip('/') + '/coair-api'
    token = ''

    def call(path, body=None):
        headers = {'Content-Type': 'application/json', 'X-Project-ID': credentials['project_id']}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = urllib.request.Request(base + path,
            data=None if body is None else json.dumps(body).encode(), headers=headers)
        with urllib.request.urlopen(request, timeout=600) as response:
            return json.load(response)

    def login():
        return call('/auth/login', {key: credentials[key] for key in ('username', 'password')})['access_token']

    report = {'started_at': time.time(), 'project_id': credentials['project_id'],
              'submission_complete': False, 'processing_complete': False, 'sources': []}

    def save():
        report['updated_at'] = time.time()
        args.report.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.report.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, indent=2))
        temporary.chmod(0o600)
        temporary.replace(args.report)

    token = login()
    if args.monitor_only:
        report = json.loads(args.report.read_text())
    else:
        inbox = call('/local/inbox')['files']
        # Tables first, then PDFs. All files are still submitted to the durable queue.
        inbox.sort(key=lambda row: (Path(row['path']).suffix.lower() == '.pdf', row['path']))
        report['source_count'] = len(inbox)
        for start in range(0, len(inbox), 25):
            batch = inbox[start:start + 25]
            try:
                result = call('/local/import', {'paths': [row['path'] for row in batch]})
                for source, uploaded in zip(batch, result['files']):
                    report['sources'].append(dict(source, file_id=uploaded['file_id'], status='submitted'))
            except Exception:
                # An interrupted batch can have committed a prefix; import is deduplicated.
                for source in batch:
                    try:
                        result = call('/local/import', {'paths': [source['path']]})
                        report['sources'].append(dict(source, file_id=result['files'][0]['file_id'], status='submitted'))
                    except Exception as exc:
                        report['sources'].append(dict(source, status='submission_failed', error=str(exc)))
            save()
            print(json.dumps({'submitted_sources': len(report['sources']), 'total':len(inbox)}), flush=True)
        report['submission_complete'] = True
        report['unique_file_count'] = len({row['file_id'] for row in report['sources'] if row.get('file_id')})
        save()
    last_login = time.monotonic()
    while True:
        try:
            if time.monotonic() - last_login > 1800:
                token = login()
                last_login = time.monotonic()
            jobs = {row['file_id']: row for row in call('/indexing/status')}
            for row in report['sources']:
                job = jobs.get(row.get('file_id'))
                if job:
                    row.update(status=job['status'], error=job.get('error'), details=job.get('details', {}))
            report['counts'] = dict(Counter(row['status'] for row in report['sources']))
            report['processing_complete'] = all(row['status'] in ('ready', 'failed', 'credit_balance_exhausted', 'submission_failed') for row in report['sources'])
            report['all_jobs_ready'] = bool(report['sources']) and all(row['status'] == 'ready' for row in report['sources'])
            report['all_sources_ready'] = False
            save()
            print(json.dumps({'elapsed_seconds':round(time.time()-report['started_at']), **report['counts']}), flush=True)
            if report['processing_complete']:
                import subprocess
                verification = subprocess.run(['docker', 'exec', 'coair-local-api-1', 'python', '-m',
                    'scripts.dgx_ingestion_audit', '--project', credentials['project_id']],
                    capture_output=True, text=True, timeout=300)
                target = args.report.with_name('application-verification.json')
                if verification.returncode == 0:
                    # Fail closed if stdout is not a JSON audit.
                    audit = json.loads(verification.stdout)
                    target.write_text(json.dumps(audit, indent=2))
                    target.chmod(0o600)
                    report['verification_report'] = str(target)
                    report['all_sources_ready'] = report['all_jobs_ready'] and audit['all_sources_embedded'] and audit['all_pdf_pages_checked']
                else:
                    report['verification_error'] = verification.stderr[-1000:]
                    report['all_sources_ready'] = False
                save()
                break
        except Exception as exc:
            print(json.dumps({'monitor_error': str(exc)}), flush=True)
            token = ''
            try:
                token = login()
            except Exception:
                pass
        time.sleep(30)


if __name__ == '__main__':
    main()

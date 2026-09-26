"""Retry failed vector writes after repairing the local vector service."""
import argparse
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()
    if os.getenv('DEPLOYMENT_MODE') != 'local':
        parser.error('Only available in local deployment mode')
    from backend.tasks.ingestion_jobs import get_ingestion_job_store
    from src.config import QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION
    from qdrant_client import QdrantClient
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    info = client.get_collection(QDRANT_COLLECTION)
    if str(info.status) != 'green' or info.optimizer_status != 'ok':
        raise SystemExit('Vector collection must be healthy before retrying')
    store = get_ingestion_job_store()
    jobs = [job for job in store.list_project(args.project)
            if job['status'] == 'failed'
            and 'embedding_failed' in (job.get('error') or '')]
    if args.limit > 0:
        jobs = jobs[:args.limit]
    for job in jobs:
        if args.apply:
            store.enqueue(job['project_id'], job['file_id'], job['file_path'],
                          job['filename'], requested_by=job['requested_by'])
    print(f"{'Queued' if args.apply else 'Eligible'}: {len(jobs)} vector retries")


if __name__ == '__main__':
    main()

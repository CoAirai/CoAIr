#!/usr/bin/env python3
"""Read-only audit: ready jobs must have vectors; PDF coverage is measured."""
import argparse
import json
from collections import Counter
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', required=True)
    args = parser.parse_args()
    from src.config import STORAGE_DIR, QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION
    from backend.tasks.ingestion_jobs import get_ingestion_job_store
    from qdrant_client import QdrantClient, models
    sources = {path.name for path in Path('/import').rglob('*') if path.is_file() and path.suffix.lower() in ('.pdf','.xls','.xlsx','.csv')}
    jobs = [row for row in get_ingestion_job_store().list_project(args.project) if row['filename'] in sources]
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    counts = Counter()
    offset = None
    while True:
        points, offset = client.scroll(QDRANT_COLLECTION, limit=256, offset=offset,
            scroll_filter=models.Filter(must=[models.FieldCondition(key='project_id',match=models.MatchValue(value=args.project))]),
            with_payload=['file_id'], with_vectors=False)
        counts.update(point.payload.get('file_id') for point in points)
        if offset is None:
            break
    missing = [row['filename'] for row in jobs if row['status']=='ready' and not counts[row['file_id']]]
    audits = []
    for path in (Path(STORAGE_DIR)/'ocr_audits').glob('*-eng-auto.json'):
        value = json.loads(path.read_text())
        if value['file_name'] in sources:
            audits.append(value)
    metadata_failures = []
    root = Path(STORAGE_DIR)/'document_metadata'/args.project
    for path in root.glob('*/metadata-failure.json'):
        value = json.loads(path.read_text())
        if value['file_name'] in sources:
            metadata_failures.append({'file':value['file_name'],'error':value['error']})
    result = {
        'source_count':len(sources), 'jobs':dict(Counter(row['status'] for row in jobs)),
        'vector_count':sum(counts[row['file_id']] for row in jobs),
        'ready_files_missing_vectors':missing,
        'failures':[{'file':row['filename'],'error':row['error']} for row in jobs if row['status']=='failed'],
        'metadata_failures':metadata_failures,
        'audited_pdfs':len(audits), 'audited_pages':sum(row['processed_pages'] for row in audits),
        'pdfs_with_incomplete_page_coverage':[row['file_name'] for row in audits if not row['all_pages_processed']],
        'low_text_pages':sum(page['characters'] < 10 for row in audits for page in row['pages']),
        'pdfs_missing_audit':sorted(name for name in sources if name.lower().endswith('.pdf') and name not in {row['file_name'] for row in audits}),
    }
    result['all_sources_embedded'] = len(jobs)==len(sources) and all(row['status']=='ready' for row in jobs) and not missing
    result['all_pdf_pages_checked'] = not result['pdfs_missing_audit'] and not result['pdfs_with_incomplete_page_coverage']
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    main()

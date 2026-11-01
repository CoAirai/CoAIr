"""Index all nonempty spreadsheet cells for local semantic document search."""
from pathlib import Path


def spreadsheet_pages(file_path, chunk_chars=6000):
    import pandas as pd
    path = Path(file_path)
    sheets = ({'CSV': pd.read_csv(path, header=None, dtype=object)}
              if path.suffix.lower() == '.csv'
              else pd.read_excel(path, sheet_name=None, header=None, dtype=object))
    pages = {}
    for sheet_name, frame in sheets.items():
        lines = []
        size = 0
        for row_number, row in enumerate(frame.itertuples(index=False, name=None), 1):
            cells = [f'Column {column}: {value}' for column, value in enumerate(row, 1)
                     if pd.notna(value) and str(value).strip()]
            if not cells:
                continue
            line = f'Sheet {sheet_name}, row {row_number}: ' + ' | '.join(cells)
            if lines and size + len(line) > chunk_chars:
                pages[len(pages) + 1] = '\n'.join(lines)
                lines, size = [], 0
            lines.append(line)
            size += len(line) + 1
        if lines:
            pages[len(pages) + 1] = '\n'.join(lines)
    if not pages:
        raise ValueError('spreadsheet_has_no_extractable_cells')
    return pages


def index_spreadsheet(file_path, *, project_id, file_id):
    from .document_rag import get_document_rag
    from .document_index import get_document_index
    from .local_metadata import extract_metadata_for_ingestion
    from backend.tasks.progress import report
    report('extracting', 0.20)
    pages = spreadsheet_pages(file_path)
    report('metadata', 0.40)
    metadata = extract_metadata_for_ingestion(project_id=project_id, file_id=file_id,
                                file_name=Path(file_path).name, pages=pages)
    rag = get_document_rag()
    documents = rag.add_document_from_pages(
        file_path, pages, project_id=project_id, file_id=file_id,
        metadata={'source_type': 'spreadsheet', 'extraction_method': 'direct_cells',
                  'document_title': metadata['title'], 'summary': metadata['summary'],
                  'date': metadata['date'], 'doc_type': 'spreadsheet',
                  'people': metadata['people'], 'metadata_status': metadata['status']})
    if not documents:
        raise ValueError('spreadsheet_text_index_empty')
    report('embedding', 0.55)
    if not rag.insert_documents(documents, project_id=project_id, file_id=file_id):
        raise RuntimeError('spreadsheet_embedding_failed')
    index = get_document_index()
    record = next((row for row in index.list_project(project_id) if row.doc_id == file_id), None)
    if record:
        from dataclasses import replace
        index.upsert(replace(record, title=metadata['title'],
                             description=metadata['summary'], parties=metadata['parties']))
    return len(pages)

"""Regressions from the real AWS/Azure corpus comparison, without model calls."""
import io
from pathlib import Path
from types import SimpleNamespace

import pytest


def analyzer(monkeypatch):
    import src.data_analyzer_sql as module
    monkeypatch.setattr(module, '_active_project', lambda: 'a')
    obj = object.__new__(module.DataAnalyzerSQL)
    obj.tables = {
        'detail': {'project_id': 'a', 'source_file': '/old/data/Book.xlsx'},
        'summary': {'project_id': 'a', 'source_file': '/old/data/Book.xlsx'},
        'other': {'project_id': 'a', 'source_file': '/old/data/Other.xlsx'},
        'foreign': {'project_id': 'b', 'source_file': '/foreign/Book.xlsx'},
    }
    return obj


def test_named_workbook_intersects_selection_and_project_before_ranking(monkeypatch):
    obj = analyzer(monkeypatch)
    assert obj.constrain_named_sources('Count Book.xlsx') == ['detail', 'summary']
    assert obj.constrain_named_sources('Count BOOK.XLSX', ['detail']) == ['detail']
    assert obj.constrain_named_sources('Count Book.xlsx', ['other']) == []
    assert obj.constrain_named_sources('Count Missing.xlsx') == []
    assert obj.constrain_named_sources('Compare Book.xlsx with Missing.xlsx') == []
    assert obj.constrain_named_sources('Count Other.xlsx') == ['other']
    assert obj.constrain_named_sources('Book.xlsx\nCurrent question: Count Other.xlsx') == ['other']
    obj.tables['collision'] = {'project_id': 'a', 'source_file': '/another/Book.xlsx'}
    assert obj.constrain_named_sources('Count Book.xlsx') == []


def test_missing_named_workbook_cannot_fallback_to_largest_table(monkeypatch):
    obj = analyzer(monkeypatch)
    result = obj.query('Show Missing.xlsx', table_name='detail')
    assert result['sources'] == [] and result['sql'] is None


def test_original_sheet_rebases_under_data_root_without_identity_changes(tmp_path, monkeypatch):
    import src.config as config
    import src.catalog as catalog
    from src.sheet_reader import _source_path, sheet_grid
    root = tmp_path / 'data'
    original = root / 'projects/a/documents/Book.csv'
    original.parent.mkdir(parents=True)
    original.write_text('Name,Amount\nDepot,12\n', encoding='utf-8')
    monkeypatch.setattr(config, 'DATA_DIR', root)
    monkeypatch.setattr(catalog, '_active_project', lambda: 'a')
    info = {'source_file': '/old/Mac/data/projects/a/documents/Book.csv', 'project_id': 'a'}
    assert _source_path(info) == str(original)
    grid, _ = sheet_grid(info)
    assert 'Depot' in grid and '12' in grid
    assert info['source_file'].startswith('/old/Mac/')
    with pytest.raises(PermissionError):
        _source_path({**info, 'project_id': 'b'})
    with pytest.raises(FileNotFoundError):
        _source_path({**info, 'source_file': '/old/data/projects/b/documents/Book.csv'})
    outside = tmp_path / 'secret.csv'
    outside.write_text('secret')
    (root / 'leak.csv').symlink_to(outside)
    with pytest.raises(FileNotFoundError):
        _source_path({**info, 'source_file': '/old/data/leak.csv'})


def test_generic_project_words_do_not_inject_p6_but_explicit_p6_still_works(monkeypatch):
    import src.jargon_manager as module
    monkeypatch.setattr(module, 'project_domain_hint', lambda: 'Edinburgh Tram Inquiry')
    manager = module.JargonManager()
    query = 'Find the project documents about the Tram Depot'
    prepared = manager.prepare_query(query)
    assert all('P6' not in text and 'Primavera' not in text
               for text in [prepared.context, *prepared.retrieval_queries])
    assert 'P6' not in manager.replace_query_terms_with_meanings(query)
    assert 'XER table' in manager.replace_query_terms_with_meanings('Explain the P6 PROJECT table')
    assert 'XER table' in manager.prepare_query('Explain the P6 PROJECT table').context


def test_word_export_survives_invalid_pdf_characters_in_every_input():
    from docx import Document
    from src.answer_docx import build_answer_docx
    blob = build_answer_docx(
        'Depot\x04 question', '### **Heading**\n\n| Event | Date |\n|---|---|\n| Depot\x04 | 2008 |',
        title_text='Project\x00 record', sql='SELECT\x04 1',
        citations=[{'doc_name': 'USB\x04.pdf', 'anchor': 'page_2', 'snippet': 'A\x04 £12\ud800 fact\nnext line'}],
        table_columns=['Total\x00'], table_rows=[['£12\x04']],
    )
    document = Document(io.BytesIO(blob))
    text = '\n'.join(p.text for p in document.paragraphs)
    assert 'USB.pdf  p.2' in text and '£12 fact\nnext line' in text
    assert len(document.tables) == 2
    assert document.tables[0].rows[1].cells[0].text == 'Depot'
    assert document.tables[1].rows[1].cells[0].text == '£12'
    assert any(run.bold for p in document.paragraphs for run in p.runs if 'Heading' in run.text)


def test_project_conversation_sync_is_incremental_and_restore_keeps_directories(tmp_path, monkeypatch):
    import src.config as config
    import src.gcs_storage as storage
    monkeypatch.setattr(config, 'CONVERSATIONS_DIR', tmp_path)
    monkeypatch.setattr(storage, 'is_enabled', lambda: True)
    monkeypatch.setattr(storage, '_conversation_hashes', {})
    blobs, calls = {}, []
    def upload(path, key):
        blobs[key] = Path(path).read_bytes()
        calls.append(key)
        return True
    monkeypatch.setattr(storage, 'upload_file', upload)
    for project in ['a', 'b']:
        folder = tmp_path / 'alice' / project
        folder.mkdir(parents=True)
        (folder / 'same.json').write_text(project)
    storage.sync_user_conversations_to_gcs('alice', project_id='a')
    assert calls == ['conversations/alice/a/same.json']
    storage.sync_user_conversations_to_gcs('alice', project_id='a')
    assert len(calls) == 1
    (tmp_path / 'alice/a/same.json').write_text('updated')
    storage.sync_user_conversations_to_gcs('alice', project_id='a')
    assert len(calls) == 2
    blobs.update({'conversations/alice/b/same.json': b'foreign',
                  'conversations/alice/a/../../escape.json': b'bad',
                  'conversations/bob/a/injected.json': b'bad'})
    monkeypatch.setattr(storage, 'list_blobs', lambda prefix: list(blobs))
    def download(key, path):
        Path(path).write_bytes(blobs[key])
        return True
    monkeypatch.setattr(storage, 'download_file', download)
    restored = tmp_path / 'restored'
    monkeypatch.setattr(config, 'CONVERSATIONS_DIR', restored)
    storage.sync_user_conversations_from_gcs('alice', project_id='a')
    assert (restored / 'alice/a/same.json').read_text() == 'updated'
    assert not (restored / 'alice/b').exists()
    assert sorted(p.relative_to(restored).as_posix() for p in restored.rglob('*.json')) == ['alice/a/same.json']
    storage.sync_user_conversations_from_gcs('alice', project_id='a')
    assert (restored / 'alice/a/same.json').read_text() == 'updated'


def test_multi_table_result_keeps_rows_columns_and_source_table(monkeypatch):
    from src.hybrid_executor import HybridExecutor
    from backend.services.response_builder import _build_sql_artifact
    import src.llm_client as llm
    monkeypatch.setattr(llm, 'generate_text', lambda *a, **k: SimpleNamespace(text='Combined answer'))
    obj = object.__new__(HybridExecutor)
    obj._jargon = SimpleNamespace(expand_query=lambda value: value)
    parts = {'detail': {'sql': 'SELECT amount FROM detail', 'result_data': [{'amount': 12}], 'sources': []},
             'summary': {'sql': 'SELECT count FROM summary', 'result_data': [{'count': 41}], 'sources': []}}
    obj._data_analyzer = SimpleNamespace(tables={}, select_tables=lambda *a, **k: list(parts),
                                        query=lambda q, table_name, **k: parts[table_name])
    result = obj.execute_multi_table('Count the selected workbook')
    artifact = _build_sql_artifact(result['sql'], result['result_data'], [], result['result_columns'])
    assert artifact.row_count == 2
    assert artifact.columns == ['_source_table', 'amount', 'count']
    assert artifact.preview_rows == [{'amount': 12, '_source_table': 'detail'}, {'count': 41, '_source_table': 'summary'}]

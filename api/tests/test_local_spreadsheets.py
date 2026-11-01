import pandas as pd
from src.local_spreadsheets import spreadsheet_pages


def test_every_nonempty_cell_including_headers_and_last_sheet_is_searchable(tmp_path):
    path = tmp_path / 'test.xlsx'
    with pd.ExcelWriter(path) as writer:
        pd.DataFrame([['Project title', None], ['Budget', 123], ['Final note', 'Approved']]).to_excel(
            writer, sheet_name='Budget', index=False, header=False)
        pd.DataFrame([['Last sheet', 'Last cell']]).to_excel(writer, sheet_name='Notes', index=False, header=False)
    pages = spreadsheet_pages(path, chunk_chars=50)
    text = '\n'.join(pages.values())
    for value in ['Project title', '123', 'Final note', 'Approved', 'Last sheet', 'Last cell']:
        assert value in text
    assert 'Sheet Budget, row 1' in text
    assert 'Sheet Notes, row 1' in text
    assert 'nan' not in text
    assert len(pages) > 1


def test_late_mixed_cell_survives_parquet_serialization(tmp_path):
    from src.excel_table_extractor import ExcelTableExtractor
    frame = pd.DataFrame({'section': ['Heading'] * 60 + [123], 'amount': [1.5] * 61})
    clean = ExcelTableExtractor._sanitize_for_parquet(frame)
    path = tmp_path / 'mixed.parquet'
    clean.to_parquet(path, index=False)
    restored = pd.read_parquet(path)
    assert restored['section'].iloc[-1] == '123'
    assert restored['amount'].iloc[-1] == 1.5

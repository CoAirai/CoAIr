from types import SimpleNamespace

import pytest
from xlrd.biffh import XLRDError

from src.excel_table_extractor import ExcelTableExtractor, EncryptedWorkbookError


def test_encrypted_xls_is_not_reported_as_empty(monkeypatch):
    def unsupported(*args, **kwargs):
        raise ValueError("openpyxl does not support .xls")

    def encrypted(*args, **kwargs):
        raise XLRDError("Workbook is encrypted")

    monkeypatch.setattr("src.excel_table_extractor.load_workbook", unsupported)
    monkeypatch.setattr(ExcelTableExtractor, "_extract_via_pandas", encrypted)
    with pytest.raises(EncryptedWorkbookError, match="encrypted_workbook"):
        ExcelTableExtractor().extract_tables("protected.xls")


def test_router_preserves_password_required_error(monkeypatch):
    from src.file_router import _process_data_file

    def encrypted(*args, **kwargs):
        raise EncryptedWorkbookError("encrypted_workbook: Upload an unlocked copy.")

    def unexpected_fallback():
        pytest.fail("An encrypted workbook must not fall through to a SQL load")

    monkeypatch.setattr("src.schema_converter.get_format_converter", lambda: SimpleNamespace(
        process_excel=lambda path: [],
    ))
    monkeypatch.setattr("src.excel_table_extractor.extract_excel_tables", encrypted)
    monkeypatch.setattr("src.data_analyzer_sql.get_data_analyzer", unexpected_fallback)
    result = _process_data_file("protected.xls", project_id="p1", file_id="f1")
    assert not result.success
    assert result.error.startswith("encrypted_workbook:")

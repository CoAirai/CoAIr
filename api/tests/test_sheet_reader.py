"""Spreadsheet questions read the original cells.

The Edinburgh AFC question was answered from a value-engineering savings sheet
labelled as Anticipated Final Cost, because ranking matched request words
("spreadsheet", "sheet", "cost line") and the real AFC sheet's SQL import had
lost its headings.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

pd = pytest.importorskip("pandas")
pytest.importorskip("openpyxl")

import src.sheet_reader as sheet_reader

QUESTION = ("Using the Excel spreadsheets in the project, what is the Anticipated Final Cost "
            "broken down by cost line, and what is the total? Name the spreadsheet file and "
            "sheet each figure comes from.")


@pytest.fixture
def workbooks(tmp_path, monkeypatch):
    monkeypatch.setattr(sheet_reader, "INDEX_PATH", tmp_path / "sheet_index.json")
    monkeypatch.setattr(sheet_reader, "_index", {})
    monkeypatch.setattr(sheet_reader, "_index_loaded", False)

    afc = tmp_path / "CEC00348328.xlsx"
    with pd.ExcelWriter(afc) as writer:
        pd.DataFrame([
            ["Client/ Other Risk Analysis", None, None],
            [None, None, None],
            ["Description", "Category", "Estimated Final Cost"],
            ["Utility diversions", "MUDFA", 2500000],
            ["Sewer at South Gyle", "MUDFA", 1000000],
        ]).to_excel(writer, sheet_name="BSC delivered AFC", header=False, index=False)
    savings = tmp_path / "CEC01431386.xls.xlsx"
    with pd.ExcelWriter(savings) as writer:
        pd.DataFrame([
            ["Value engineering agreed", None],
            ["Cost line", "Saving"],
            ["Edinburgh Park viaduct", 1470000],
        ]).to_excel(writer, sheet_name="VE Agreed with BBS", header=False, index=False)

    tables = {
        "cec00348328_bsc_delivered_afc": {
            "source_type": "excel", "source_file": str(afc), "sheet_name": "BSC delivered AFC",
        },
        "cec01431386_ve_agreed": {
            "source_type": "excel", "source_file": str(savings),
            "sheet_name": "VE Agreed with BBS",
        },
        "pdf_table": {"source_type": "pdf", "source_file": str(afc), "sheet_name": ""},
    }
    sheet_reader.build_index(tables)
    return tables


def test_final_cost_sheet_outranks_a_savings_sheet(workbooks):
    ranked = sheet_reader.rank_sheets(QUESTION, workbooks)
    assert ranked[0][0] == "cec00348328_bsc_delivered_afc"
    assert all(name != "pdf_table" for name, _ in ranked)


def test_a_named_file_wins(workbooks):
    ranked = sheet_reader.rank_sheets("Summarise what CEC01431386 contains", workbooks)
    assert ranked[0][0] == "cec01431386_ve_agreed"


def test_grid_keeps_headings_and_row_numbers(workbooks):
    grid, rows = sheet_reader.sheet_grid(workbooks["cec00348328_bsc_delivered_afc"], QUESTION)
    assert rows == 4
    assert "Row 3: A=Description | B=Category | C=Estimated Final Cost" in grid
    assert "Row 4: A=Utility diversions | B=MUDFA | C=2500000" in grid

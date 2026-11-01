import pandas as pd
import pytest

from src.table_normalizer import parse_mixed_datetime


def _iso(series):
    return parse_mixed_datetime(pd.Series(series)).dt.strftime("%Y-%m-%d").tolist()


def _iso_with(series, default_dayfirst):
    parsed = parse_mixed_datetime(pd.Series(series), default_dayfirst=default_dayfirst)
    return parsed.dt.strftime("%Y-%m-%d").tolist()


def test_uk_column_reads_ambiguous_dates_day_first():
    assert _iso(["03/04/2010", "25/03/2010", "12/01/2011"]) == [
        "2010-04-03",
        "2010-03-25",
        "2011-01-12",
    ]


def test_us_column_reads_ambiguous_dates_month_first():
    assert _iso(["03/04/2010", "09/18/2027", "12/01/2011"]) == [
        "2010-03-04",
        "2027-09-18",
        "2011-12-01",
    ]


def test_single_us_value_stays_month_first():
    assert _iso(["09/18/2027"]) == ["2027-09-18"]


def test_single_uk_value_stays_day_first():
    assert _iso(["25/03/2010"]) == ["2010-03-25"]


def test_fully_ambiguous_column_uses_day_first_by_default(monkeypatch):
    monkeypatch.delenv("SPREADSHEET_AMBIGUOUS_DATE_ORDER", raising=False)
    assert _iso(["03/04/2010", "01/02/2011"]) == ["2010-04-03", "2011-02-01"]


def test_fully_ambiguous_column_honours_month_first_setting(monkeypatch):
    monkeypatch.setenv("SPREADSHEET_AMBIGUOUS_DATE_ORDER", "month_first")
    assert _iso(["03/04/2010", "01/02/2011"]) == ["2010-03-04", "2011-01-02"]


def test_explicit_default_overrides_environment(monkeypatch):
    monkeypatch.setenv("SPREADSHEET_AMBIGUOUS_DATE_ORDER", "month_first")
    assert _iso_with(["03/04/2010"], default_dayfirst=True) == ["2010-04-03"]


def test_conflicting_column_keeps_unambiguous_values_correct():
    assert _iso(["25/03/2010", "09/18/2027", "03/04/2010"]) == [
        "2010-03-25",
        "2027-09-18",
        "2010-04-03",
    ]


@pytest.mark.parametrize(
    "values, expected",
    [
        (["03-04-2010", "25-03-2010"], ["2010-04-03", "2010-03-25"]),
        (["03/04/10", "25/03/10"], ["2010-04-03", "2010-03-25"]),
        (["03/04/2010 14:30", "25/03/2010 08:00"], ["2010-04-03", "2010-03-25"]),
    ],
)
def test_dash_short_year_and_time_forms_follow_column_order(values, expected):
    assert _iso(values) == expected


def test_other_formats_are_unchanged():
    assert _iso(
        [
            "2.01.2025",
            "2027-06-21 0:00:00",
            "15-Jan-2025",
            "2025/03/15",
            "01 March 2025",
            "1737849600",
        ]
    ) == [
        "2025-01-02",
        "2027-06-21",
        "2025-01-15",
        "2025-03-15",
        "2025-03-01",
        "2025-01-26",
    ]


def test_blank_and_invalid_values_become_missing():
    parsed = parse_mixed_datetime(pd.Series(["", None, "nan", "not a date", "25/03/2010"]))
    assert parsed.isna().tolist() == [True, True, True, True, False]

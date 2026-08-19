"""The markdown reader behind the Word export.

Pure — no python-docx, no I/O — so these assert on the blocks directly.

The table cases carry the weight. The browser (remark-gfm) and this parser must
agree on what a table is, and both need one row per line — which is what
normalize_tables restores when the model writes the whole table on one. A real
table has to be recognised and a sentence with a pipe in it must not be, so both
directions are pinned here.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.markdown_blocks import normalize_tables, parse, spans  # noqa: E402


def _types(md):
    return [b["type"] for b in parse(md)]


class TestBlockShapes:
    def test_headings_keep_their_level(self):
        out = parse("# One\n\n### Three")
        assert out == [{"type": "heading", "level": 1, "text": "One"},
                       {"type": "heading", "level": 3, "text": "Three"}]

    def test_paragraphs_join_wrapped_lines(self):
        out = parse("The delay was caused\nby a water main.")
        assert out == [{"type": "para",
                        "text": "The delay was caused by a water main."}]

    def test_blank_line_separates_paragraphs(self):
        assert _types("one\n\ntwo") == ["para", "para"]

    def test_bullets_and_nesting(self):
        out = parse("- top\n    - nested\n* also top")
        assert [(b["type"], b["depth"]) for b in out] == [
            ("bullet", 0), ("bullet", 1), ("bullet", 0)]

    def test_ordered_lists_keep_their_numbers(self):
        out = parse("1. first\n2. second\n10) tenth")
        assert [b["number"] for b in out] == [1, 2, 10]

    def test_quote_code_and_rule(self):
        out = parse("> quoted\n\n```sql\nSELECT 1\n```\n\n---")
        assert _types("> quoted\n\n```sql\nSELECT 1\n```\n\n---") == [
            "quote", "code", "rule"]
        code = [b for b in out if b["type"] == "code"][0]
        assert code["text"] == "SELECT 1" and code["lang"] == "sql"

    def test_fenced_code_keeps_markdown_inside_it_literal(self):
        """A fence is verbatim — a '# ' inside it is not a heading."""
        out = parse("```\n# not a heading\n- not a bullet\n```")
        assert out == [{"type": "code", "text": "# not a heading\n- not a bullet",
                        "lang": ""}]

    def test_empty_and_whitespace_input(self):
        assert parse("") == [] and parse("   \n\n  ") == []

    def test_an_indented_line_continues_its_list_item(self):
        """Found by the real-answer test below. The model wraps long list items,
        and without this the tail became a stray paragraph outside the list —
        which reads as broken in a document someone hands on."""
        out = parse("1. a delay from the planned start date\n"
                    "   of 01/08/08 until 18/02/09.")
        assert out == [{"type": "ordered", "number": 1, "depth": 0,
                        "text": "a delay from the planned start date "
                                "of 01/08/08 until 18/02/09."}]

    def test_an_unindented_line_after_a_list_item_stays_a_paragraph(self):
        """Unindented lazy continuation is indistinguishable from the next
        paragraph; joining there would merge text the writer separated."""
        assert _types("- item\nA new sentence.") == ["bullet", "para"]

    def test_continuation_does_not_swallow_a_nested_item(self):
        out = parse("- top\n    - nested")
        assert [(b["type"], b["depth"]) for b in out] == [("bullet", 0), ("bullet", 1)]


class TestTables:
    def test_a_pipe_table_becomes_a_table(self):
        md = ("| Document | Page |\n"
              "|---|---|\n"
              "| CEC00381196_PART1.pdf | 5 |\n"
              "| WED00000533.pdf | 25 |")
        out = parse(md)
        assert len(out) == 1 and out[0]["type"] == "table"
        assert out[0]["header"] == ["Document", "Page"]
        assert out[0]["rows"] == [["CEC00381196_PART1.pdf", "5"],
                                  ["WED00000533.pdf", "25"]]

    def test_prose_with_a_pipe_is_not_a_table(self):
        """The separator row is the whole signal. Without it this is a sentence."""
        out = parse("The trade-off was cost | schedule, and neither won.")
        assert _types("The trade-off was cost | schedule, and neither won.") == ["para"]
        assert "cost | schedule" in out[0]["text"]

    def test_a_ragged_row_is_padded_not_dropped(self):
        md = "| a | b | c |\n|---|---|---|\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |"
        rows = parse(md)[0]["rows"]
        assert rows == [["1", "2", ""], ["1", "2", "3"]]

    def test_a_table_ends_at_a_blank_line(self):
        md = "| a | b |\n|---|---|\n| 1 | 2 |\n\nAfterwards."
        assert _types(md) == ["table", "para"]

    def test_table_without_outer_pipes(self):
        out = parse("a | b\n--- | ---\n1 | 2")
        assert out[0]["header"] == ["a", "b"] and out[0]["rows"] == [["1", "2"]]


class TestCollapsedTables:
    """A table the model wrote without the newlines between its rows.

    Seen in production on a "top 10 agreed VE items" answer: header, separator
    and every row arrive on one line, so neither GFM in the browser nor the
    parser above sees a table and the reader gets a paragraph full of pipes.
    """

    COLLAPSED = (
        "The top 10 agreed VE items account for £12,795,000.00.\n"
        "| Rank | Ref No. | VE Description | Agreed VE Saving (£) | % of Top 10 | "
        "| :---: | :---: | :--- | :---: | :---: | "
        "| 1 | 42 | Network Rail Immunisation | £4,700,000.00 | 36.73% | "
        "| 2 | 145 | Consolidated Depot Design | £2,000,000.00 | 15.63% | "
        "| TOTAL | | Top 10 Agreed VE Savings Total | £12,795,000.00 | 100.00% |\n"
        "Total Portfolio VE Register Pool: £15,116,980.00"
    )

    def test_the_rows_come_back_onto_their_own_lines(self):
        out = normalize_tables(self.COLLAPSED).split("\n")
        assert out[2].startswith("| Rank |")
        assert out[3].startswith("| :---:")
        assert len([line for line in out if line.startswith("|")]) == 5

    def test_the_repaired_text_parses_as_a_table(self):
        blocks = parse(normalize_tables(self.COLLAPSED))
        assert _types(normalize_tables(self.COLLAPSED)) == ["para", "table", "para"]
        table = blocks[1]
        assert table["header"][0] == "Rank"
        assert table["rows"][0][2] == "Network Rail Immunisation"

    def test_an_empty_cell_inside_a_row_survives(self):
        """The TOTAL row spans two columns by leaving them blank.

        Splitting on "| |" would tear that row in half; the column count is what
        keeps it whole.
        """
        table = parse(normalize_tables(self.COLLAPSED))[1]
        assert table["rows"][-1] == ["TOTAL", "", "Top 10 Agreed VE Savings Total",
                                     "£12,795,000.00", "100.00%"]

    def test_a_table_the_model_wrote_correctly_is_untouched(self):
        md = "| a | b |\n|---|---|\n| 1 | 2 |"
        assert normalize_tables(md) == md

    def test_prose_with_pipes_is_untouched(self):
        """No separator run, no table — the lazy SQL summary joins cells this way."""
        md = "**Total | 12 | £4,700,000.00**"
        assert normalize_tables(md) == md

    def test_a_line_that_does_not_chunk_evenly_is_left_alone(self):
        """Half a repaired table is worse than the pipes it replaced."""
        md = "| a | b | c | | :---: | :---: | :---: | | 1 | 2 |"
        assert normalize_tables(md) == md

    def test_a_header_row_is_given_its_own_block(self):
        """GFM tables cannot interrupt a paragraph, so a blank line is inserted."""
        out = normalize_tables(self.COLLAPSED).split("\n")
        assert out[1] == ""

    def test_text_without_tables_is_returned_unchanged(self):
        assert normalize_tables("Just a sentence.") == "Just a sentence."
        assert normalize_tables("") == ""

    def test_a_lead_in_on_the_same_line_keeps_its_own_line(self):
        out = normalize_tables("Here are the results: | a | b | | --- | --- | | 1 | 2 |")
        assert out.split("\n")[0] == "Here are the results:"
        assert _types(out) == ["para", "table"]

    def test_a_sentence_with_a_pipe_before_a_table_is_never_cut(self):
        """Splitting on the first pipe would leave "The trade-off was cost" as a
        lead-in and "schedule…" as a header, so a prefix containing a pipe
        disqualifies the whole line."""
        md = "The trade-off was cost | schedule | --- | --- | and neither won."
        assert normalize_tables(md) == md


class TestTablesBetweenText:
    """A table living among prose, lists and headings.

    Measured against remark-gfm, the renderer the chat uses. Two neighbours
    break it in opposite ways: a table straight after a list is swallowed by
    the list and never renders, and a sentence straight after the last row is
    parsed as one more row — the prose vanishes into a cell.
    """

    TABLE = "| a | b |\n|---|---|\n| 1 | 2 |"

    def test_a_table_after_a_bullet_list_is_separated_from_it(self):
        out = normalize_tables("Findings:\n- one\n- two\n" + self.TABLE)
        assert _types(out) == ["para", "bullet", "bullet", "table"]
        assert out.split("\n")[3] == ""

    def test_a_table_after_a_numbered_list_is_separated_from_it(self):
        out = normalize_tables("1. first\n2. second\n" + self.TABLE)
        assert _types(out) == ["ordered", "ordered", "table"]

    def test_a_sentence_after_the_last_row_stays_a_sentence(self):
        out = normalize_tables(self.TABLE + "\nTotal pool: £15,116,980.00")
        assert _types(out) == ["table", "para"]
        assert out.endswith("\n\nTotal pool: £15,116,980.00")

    def test_a_table_between_two_paragraphs(self):
        out = normalize_tables("Intro.\n" + self.TABLE + "\nOutro.")
        assert _types(out) == ["para", "table", "para"]

    def test_two_tables_in_one_answer_both_survive(self):
        out = normalize_tables(self.TABLE + "\nMiddle.\n" + self.TABLE)
        assert _types(out) == ["table", "para", "table"]

    def test_a_table_after_a_heading(self):
        out = normalize_tables("## Results\n" + self.TABLE)
        assert _types(out) == ["heading", "table"]

    def test_an_answer_already_spaced_correctly_is_untouched(self):
        md = "Intro.\n\n" + self.TABLE + "\n\nOutro."
        assert normalize_tables(md) == md


class TestInlineSpans:
    def test_bold_italic_and_code(self):
        assert list(spans("a **b** c *d* e `f`")) == [
            ("a ", ""), ("b", "bold"), (" c ", ""), ("d", "italic"),
            (" e ", ""), ("f", "code")]

    def test_underscore_forms(self):
        assert list(spans("__b__ and _i_")) == [
            ("b", "bold"), (" and ", ""), ("i", "italic")]

    def test_a_link_keeps_its_url_in_parentheses(self):
        """Printed reports outlive live links, so the URL travels as text."""
        assert list(spans("see [the report](https://x.test/r.pdf)")) == [
            ("see the report (https://x.test/r.pdf)", "")]

    def test_plain_text_is_one_span(self):
        assert list(spans("nothing special here")) == [("nothing special here", "")]

    def test_stray_asterisk_is_not_a_span(self):
        assert list(spans("2 * 3 = 6")) == [("2 * 3 = 6", "")]


class TestRealAnswerShape:
    """A production answer, abbreviated — the shape the exporter actually gets."""

    ANSWER = """The delay to the construction of the depot was caused by several factors:

1.  **Water Main and Delayed Site Access:** A delay from the planned start date
    of 01/08/08 until 18/02/09.
2.  **MUDFA Works:** Outstanding utility diversions in the same area.

| Cause | Period |
|---|---|
| Water main | 01/08/08 – 18/02/09 |
| MUDFA | ongoing |

> tie accepted responsibility for the access delay.
"""

    def test_it_parses_into_the_expected_sequence(self):
        assert _types(self.ANSWER) == [
            "para", "ordered", "ordered", "table", "quote"]

    def test_the_table_survives_intact(self):
        table = [b for b in parse(self.ANSWER) if b["type"] == "table"][0]
        assert table["header"] == ["Cause", "Period"]
        assert table["rows"] == [["Water main", "01/08/08 – 18/02/09"],
                                 ["MUDFA", "ongoing"]]

    def test_bold_inside_a_list_item_is_still_bold(self):
        first = [b for b in parse(self.ANSWER) if b["type"] == "ordered"][0]
        styles = [s for _, s in spans(first["text"])]
        assert "bold" in styles

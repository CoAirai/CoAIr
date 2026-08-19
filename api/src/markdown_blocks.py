"""Markdown → a flat block list, for the .docx exporter.

Only the subset the chat actually produces and the browser actually shows. The
chat renders answers with react-markdown **and remark-gfm**, so what the reader
sees and what this draws now agree — pipe tables included.

:func:`normalize_tables` is the one thing here that is not about the export. A
model sometimes writes a whole table on a single line; GFM and this parser both
require one row per line, so the answer is repaired once, in the response
builder, and both the screen and the exported file benefit.

FLATTENED, deliberately: inline HTML, images, footnotes, reference-style links,
task lists, nested tables, definition lists. Each is either absent from these
answers or meaningless in a Word paragraph, and a half-supported feature that
silently drops content is worse than one documented as unsupported.

No new dependency. A markdown library would be a container rebuild for a subset
this small, and a line-oriented reader is pure — no python-docx, no I/O — so the
tests can assert on the blocks directly.
"""

from __future__ import annotations

import re
from typing import Dict, Iterator, List, Tuple

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_BULLET = re.compile(r"^(\s*)[-*+]\s+(.*)$")
_ORDERED = re.compile(r"^(\s*)(\d+)[.)]\s+(.*)$")
_QUOTE = re.compile(r"^>\s?(.*)$")
_HRULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
_FENCE = re.compile(r"^\s*```(\w*)\s*$")
# A table row is a line with at least two pipe-separated cells. The separator row
# beneath the header is what distinguishes a table from a sentence with a pipe in
# it, so we never commit to a table without seeing one.
_TABLE_ROW = re.compile(r"^\s*\|?(.+\|.+?)\|?\s*$")
_TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$")


_SEP_CELL = re.compile(r"^:?-{2,}:?$")


def _cells(line: str) -> List[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _split_collapsed_table(line: str) -> List[str] | None:
    """A whole pipe table written on one line, back as one line per row.

    Returns None — meaning "leave this line alone" — for anything that is not
    unambiguously a collapsed table. Half-repairing a table is worse than
    showing the pipes, so every uncertainty bails out.
    """
    stripped = line.strip()
    if "|" not in stripped or "-" not in stripped:
        return None
    # A lead-in on the same line ("Here are the results: | Rank | …") is kept as
    # its own line. Only a prefix with no pipe of its own qualifies, so a
    # sentence that merely contains a pipe can never be cut in half.
    lead = ""
    if not stripped.startswith("|"):
        lead, _, stripped = stripped.partition("|")
        stripped = "|" + stripped
        if "|" in lead:
            return None
        lead = lead.strip()

    parts = [c.strip() for c in stripped.split("|")]
    if parts and not parts[0]:
        parts = parts[1:]
    if parts and not parts[-1]:
        parts = parts[:-1]

    first_sep = next((i for i, cell in enumerate(parts) if _SEP_CELL.match(cell)), -1)
    if first_sep < 2:
        return None
    # Joining "…last |" to "| next…" leaves one empty cell behind at every row
    # boundary, so the separator run starts one cell later than the header
    # width. It is not guaranteed though, so both readings are tried and the
    # one that chunks the whole line cleanly wins.
    for width in (first_sep - 1, first_sep):
        if width < 2:
            continue
        rows = _chunk_row_cells(parts, width)
        if rows is None or len(rows) < 3:
            continue
        if not all(_SEP_CELL.match(cell) for cell in rows[1]):
            continue
        # A body cell may be empty (a spanning "TOTAL" row) but must never be a
        # second separator run: that would be two tables glued together, whose
        # column counts need not agree.
        if any(_SEP_CELL.match(cell) for row in rows[2:] for cell in row):
            continue
        out = ["| " + " | ".join(row) + " |" for row in rows]
        return ([lead] + out) if lead else out
    return None


def _chunk_row_cells(parts: List[str], width: int) -> List[List[str]] | None:
    """Cut a flat cell list into rows of ``width``, absorbing boundary blanks."""
    rows: List[List[str]] = []
    i = 0
    while i < len(parts):
        if i + width > len(parts):
            return None
        rows.append(parts[i:i + width])
        i += width
        # The blank left by "| |" belongs to neither row. A row's own leading
        # empty cell is unaffected: exactly one blank is dropped, so a genuine
        # empty first cell still arrives as the next row's first cell.
        if i < len(parts) and parts[i] == "":
            i += 1
    return rows


def _isolate_tables(lines: List[str]) -> List[str]:
    """Put a blank line on each side of every table.

    Both neighbours matter, and each fails differently — measured against
    remark-gfm, the renderer the chat actually uses:

    * A table written straight after a bullet or numbered list is swallowed by
      the list and never becomes a table at all.
    * A sentence written straight after the last row is parsed as one more row
      of the table, so it disappears out of the prose and into a cell.

    Answers mix prose, lists and tables freely, so this runs over every table,
    not only the ones repaired above.
    """
    out: List[str] = []
    i = 0
    while i < len(lines):
        if (i + 1 < len(lines) and _TABLE_ROW.match(lines[i])
                and _TABLE_SEP.match(lines[i + 1])):
            if out and out[-1].strip():
                out.append("")
            out.append(lines[i])
            out.append(lines[i + 1])
            i += 2
            while i < len(lines) and lines[i].strip() and _TABLE_ROW.match(lines[i]):
                out.append(lines[i])
                i += 1
            if i < len(lines) and lines[i].strip():
                out.append("")
            continue
        out.append(lines[i])
        i += 1
    return out


def normalize_tables(md: str) -> str:
    """Make every table in an answer survive the trip to the screen.

    Two repairs, both driven by what actually breaks in production:

    1. A table the model wrote on a single line — header, separator and every
       row glued together — is put back onto one line per row. GFM and
       :func:`parse` below both require that, so otherwise the reader gets a
       paragraph full of pipes.
    2. A table sitting between paragraphs, lists or headings is separated from
       its neighbours by blank lines, which is what keeps it a table and keeps
       the sentence after it out of the table.

    Everything else is returned untouched, byte for byte.
    """
    if not md or "|" not in md:
        return md

    lines = md.replace("\r\n", "\n").split("\n")
    expanded: List[str] = []
    for line in lines:
        rows = _split_collapsed_table(line)
        expanded.extend([line] if rows is None else rows)

    out = _isolate_tables(expanded)
    return "\n".join(out) if out != lines else md


def parse(md: str) -> List[Dict]:
    """Blocks, in order. Each is one of:

        {"type": "heading", "level": 1..6, "text": str}
        {"type": "para",    "text": str}
        {"type": "bullet",  "text": str, "depth": 0|1}
        {"type": "ordered", "text": str, "depth": 0|1, "number": int}
        {"type": "quote",   "text": str}
        {"type": "code",    "text": str, "lang": str}
        {"type": "rule"}
        {"type": "table",   "header": [str], "rows": [[str]]}
    """
    lines = (md or "").replace("\r\n", "\n").split("\n")
    out: List[Dict] = []
    para: List[str] = []
    i = 0

    def flush() -> None:
        if para:
            text = " ".join(para).strip()
            if text:
                out.append({"type": "para", "text": text})
            para.clear()

    while i < len(lines):
        line = lines[i]

        fence = _FENCE.match(line)
        if fence:
            flush()
            lang, buf, i = fence.group(1), [], i + 1
            while i < len(lines) and not _FENCE.match(lines[i]):
                buf.append(lines[i])
                i += 1
            out.append({"type": "code", "text": "\n".join(buf), "lang": lang})
            i += 1
            continue

        # Look one line ahead before committing to a table, so "cost | schedule"
        # in prose stays prose.
        if (i + 1 < len(lines) and _TABLE_ROW.match(line)
                and _TABLE_SEP.match(lines[i + 1])):
            flush()
            header = _cells(line)
            i += 2
            rows: List[List[str]] = []
            while i < len(lines) and lines[i].strip() and _TABLE_ROW.match(lines[i]):
                row = _cells(lines[i])
                # A ragged row is padded, not dropped: a missing trailing cell is
                # a typo in the model's output, not a reason to lose the row.
                rows.append((row + [""] * len(header))[:len(header)])
                i += 1
            out.append({"type": "table", "header": header, "rows": rows})
            continue

        if not line.strip():
            flush()
            i += 1
            continue

        if _HRULE.match(line):
            flush()
            out.append({"type": "rule"})
            i += 1
            continue

        m = _HEADING.match(line)
        if m:
            flush()
            out.append({"type": "heading", "level": len(m.group(1)),
                        "text": m.group(2).strip()})
            i += 1
            continue

        m = _QUOTE.match(line)
        if m:
            flush()
            out.append({"type": "quote", "text": m.group(1).strip()})
            i += 1
            continue

        m = _ORDERED.match(line)
        if m:
            flush()
            out.append({"type": "ordered", "text": m.group(3).strip(),
                        "depth": 1 if len(m.group(1)) >= 2 else 0,
                        "number": int(m.group(2))})
            i += 1
            continue

        m = _BULLET.match(line)
        if m:
            flush()
            out.append({"type": "bullet", "text": m.group(2).strip(),
                        "depth": 1 if len(m.group(1)) >= 2 else 0})
            i += 1
            continue

        # Lazy continuation: an indented line straight after a list item belongs
        # to that item. The model wraps long items this way constantly —
        #
        #     1.  **Water main:** a delay from the planned start date
        #         of 01/08/08 until 18/02/09.
        #
        # and without this the second line becomes a stray paragraph sitting
        # outside the list, which is exactly the kind of thing that reads as
        # broken in a document someone hands on. Only *indented* continuation is
        # taken: unindented lazy continuation is indistinguishable from the next
        # paragraph, and guessing there would join text the writer separated.
        if (not para and out and out[-1]["type"] in ("bullet", "ordered")
                and line[:1].isspace()):
            out[-1]["text"] = f"{out[-1]['text']} {line.strip()}".strip()
            i += 1
            continue

        para.append(line.strip())
        i += 1

    flush()
    return out


# ── inline spans ────────────────────────────────────────────────────────
# Links become "text (url)". python-docx has no first-class hyperlink and
# hand-rolling w:hyperlink for a report that will be read on paper as often as on
# screen is not worth it — the URL in parentheses survives printing, a live link
# does not.
_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
_SPANS = re.compile(r"(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)")


def spans(text: str) -> Iterator[Tuple[str, str]]:
    """(text, style) pairs; style is one of "", "bold", "italic", "code"."""
    text = _LINK.sub(lambda m: f"{m.group(1)} ({m.group(2)})", text or "")
    for part in _SPANS.split(text):
        if not part:
            continue
        if len(part) > 4 and part.startswith("**") and part.endswith("**"):
            yield part[2:-2], "bold"
        elif len(part) > 4 and part.startswith("__") and part.endswith("__"):
            yield part[2:-2], "bold"
        elif len(part) > 2 and part.startswith("`") and part.endswith("`"):
            yield part[1:-1], "code"
        elif len(part) > 2 and part[0] in "*_" and part[-1] == part[0]:
            yield part[1:-1], "italic"
        else:
            yield part, ""

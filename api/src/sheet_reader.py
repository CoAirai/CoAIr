"""Answer spreadsheet questions from the cells of the original workbook.

Inquiry spreadsheets are formatted reports: title rows, merged headings,
several header rows, notes beside the figures. Ingest guesses one header row
and stores the rest as a SQL table, and for these sheets it guesses wrong. The
Edinburgh "BSC delivered AFC" sheet is 29 columns wide with its headings on
row 4, and its stored table kept 3 columns named after a cell value. SQL over
that cannot answer "what is the anticipated final cost".

This module ranks a project's real spreadsheets by what is written in them and
gives the model the cells themselves, row by row, so it reads the sheet the
way a person would and cites file, sheet and row.
"""

from __future__ import annotations

import json
import math
import os
import re
import threading
from collections import Counter
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from .config import STORAGE_DIR
from .logger import logger

INDEX_PATH = Path(STORAGE_DIR) / "sheet_index.json"
HEAD_ROWS = 40
GRID_MAX_ROWS = 220
GRID_MAX_CHARS = 14_000
SHEET_SOURCE_TYPES = {"excel", "csv"}

# Words that describe the request rather than its subject. "Edinburgh" and
# "tram" are handled by IDF instead: they are in every sheet of that project.
_STOPWORDS = {
    "using", "use", "excel", "excels", "spreadsheet", "spreadsheets", "sheet", "sheets",
    "workbook", "workbooks", "file", "files", "project", "projects", "what", "which",
    "show", "shows", "figure", "figures", "how", "they", "add", "adds", "name", "names",
    "each", "come", "comes", "from", "the", "and", "with", "for", "that", "this", "are",
    "was", "were", "does", "did", "please", "give", "tell", "list", "broken", "down",
    "into", "about", "there", "their", "its", "per", "all", "any", "out", "who", "when",
    "where", "why", "data", "table", "tables", "value", "values", "total", "totals",
}

# Construction cost terms that spreadsheets write in more than one way.
_SYNONYMS = {
    "anticipated final cost": ("afc", "estimated final cost", "efc", "forecast final cost",
                               "final cost", "outturn"),
    "estimated final cost": ("efc", "anticipated final cost", "afc", "final cost"),
    "variation": ("vo", "variations", "change", "intc"),
    "budget": ("budget", "baseline"),
    "risk": ("risk", "qra", "contingency"),
}

_lock = threading.Lock()
_build_lock = threading.Lock()
_index: Dict[str, Dict[str, Any]] = {}
_index_loaded = False
_building = False


def _key(source_file: str, sheet: str) -> str:
    return f"{source_file}::{sheet or ''}"


def _load_index() -> None:
    global _index_loaded
    if _index_loaded:
        return
    with _lock:
        if _index_loaded:
            return
        try:
            if INDEX_PATH.exists():
                _index.update(json.loads(INDEX_PATH.read_text(encoding="utf-8")))
        except Exception as e:
            logger.warning(f"[SheetReader] index unreadable, rebuilding: {e}")
        _index_loaded = True


def _save_index() -> None:
    with _lock:
        data = json.dumps(_index, ensure_ascii=False)
    tmp = INDEX_PATH.with_suffix(".tmp")
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, INDEX_PATH)


def _cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        if value.is_integer():
            return str(int(value))
        return f"{value:.2f}".rstrip("0").rstrip(".")
    text = str(value).strip()
    return "" if text.lower() in ("nan", "nat", "none") else text


def _read_grids(source_file: str, sheet: Optional[str], nrows: Optional[int]):
    """{sheet_name: DataFrame} with no header row assumed."""
    import pandas as pd
    lower = source_file.lower()
    if lower.endswith(".csv"):
        return {"": pd.read_csv(source_file, header=None, nrows=nrows, dtype=object,
                                encoding_errors="replace")}
    frames = pd.read_excel(source_file, sheet_name=sheet if sheet else None,
                           header=None, nrows=nrows, dtype=object)
    if isinstance(frames, dict):
        return frames
    return {sheet or "": frames}


def _sheet_candidates(tables: Dict[str, Dict[str, Any]],
                      allowed: Optional[Iterable[str]] = None) -> Dict[str, Dict[str, Any]]:
    names = set(allowed) if allowed is not None else None
    out = {}
    for name, info in tables.items():
        if names is not None and name not in names:
            continue
        if str(info.get("source_type", "")).lower() not in SHEET_SOURCE_TYPES:
            continue
        source = str(info.get("source_file") or "")
        if not source:
            continue
        out[name] = info
    return out


def build_index(tables: Dict[str, Dict[str, Any]]) -> int:
    """Store the first rows of every sheet as searchable text. Skips files
    whose modification time is unchanged, so restarts cost a stat per file."""
    global _building
    _load_index()
    if not _build_lock.acquire(blocking=False):
        return 0
    _building = True
    try:
        by_file: Dict[str, List[str]] = {}
        for info in _sheet_candidates(tables).values():
            by_file.setdefault(str(info["source_file"]), []).append(
                str(info.get("sheet_name") or "")
            )
        added = 0
        for source_file, sheets in by_file.items():
            try:
                mtime = os.path.getmtime(source_file)
            except OSError:
                continue
            if all(_index.get(_key(source_file, s), {}).get("mtime") == mtime for s in sheets):
                continue
            try:
                grids = _read_grids(source_file, None, HEAD_ROWS)
            except Exception as e:
                logger.warning(f"[SheetReader] cannot read {Path(source_file).name}: {e}")
                continue
            with _lock:
                for sheet, frame in grids.items():
                    words = " ".join(
                        _cell_text(v) for row in frame.itertuples(index=False) for v in row
                    )
                    _index[_key(source_file, str(sheet))] = {
                        "mtime": mtime, "head": re.sub(r"\s+", " ", words)[:6000].lower(),
                    }
                    added += 1
        if added:
            _save_index()
        logger.info(f"[SheetReader] index ready: {len(_index)} sheet(s), {added} new")
        return added
    finally:
        _building = False
        _build_lock.release()


def build_index_in_background(tables: Dict[str, Dict[str, Any]]) -> None:
    if _building:
        return
    threading.Thread(target=build_index, args=(dict(tables),), daemon=True,
                     name="sheet-index").start()


def _tokens(text: str) -> List[str]:
    return [w for w in re.findall(r"[a-z0-9]{3,}", (text or "").lower())
            if w not in _STOPWORDS]


def _phrases(question: str) -> List[str]:
    q = re.sub(r"\s+", " ", (question or "").lower())
    found: List[str] = []
    for phrase, alternatives in _SYNONYMS.items():
        if any(re.search(rf"\b{re.escape(term)}\b", q) for term in (phrase, *alternatives)
               if " " in term or len(term) <= 3):
            found.extend((phrase, *alternatives))
    return list(dict.fromkeys(found))


def rank_sheets(question: str, tables: Dict[str, Dict[str, Any]],
                allowed: Optional[Iterable[str]] = None, k: int = 3,
                ) -> List[Tuple[str, float]]:
    """Best-matching sheets for the question, highest first."""
    _load_index()
    candidates = _sheet_candidates(tables, allowed)
    if not candidates:
        return []
    missing = [n for n, i in candidates.items()
               if _key(str(i["source_file"]), str(i.get("sheet_name") or "")) not in _index]
    if missing:
        build_index_in_background(candidates)

    docs: Dict[str, Dict[str, str]] = {}
    for name, info in candidates.items():
        source = str(info["source_file"])
        sheet = str(info.get("sheet_name") or "")
        head = _index.get(_key(source, sheet), {}).get("head", "")
        docs[name] = {
            "sheet": sheet.lower(), "file": Path(source).name.split(".")[0].lower(),
            "head": head,
        }

    df = Counter()
    for doc in docs.values():
        df.update(set(_tokens(" ".join(doc.values()))))
    total = max(1, len(docs))

    def idf(term: str) -> float:
        return math.log((total + 1) / (df.get(term, 0) + 1)) + 0.1

    q_lower = (question or "").lower()
    terms = list(dict.fromkeys(_tokens(question)))
    phrases = _phrases(question)
    scored = []
    for name, doc in docs.items():
        sheet_tokens = set(_tokens(doc["sheet"]))
        file_tokens = set(_tokens(doc["file"]))
        head_tokens = set(_tokens(doc["head"]))
        score = 0.0
        for term in terms:
            weight = idf(term)
            if term in sheet_tokens:
                score += 4 * weight
            if term in file_tokens:
                score += 2 * weight
            if term in head_tokens:
                score += weight
        for phrase in phrases:
            pattern = rf"\b{re.escape(phrase)}\b"
            if re.search(pattern, doc["sheet"]):
                score += 12
            elif re.search(pattern, doc["head"]):
                score += 6
        if doc["file"] and doc["file"] in q_lower:
            score += 100
        if score > 0:
            scored.append((name, round(score, 2)))
    scored.sort(key=lambda item: -item[1])
    return scored[:k]


def _column_letter(index: int) -> str:
    letters = ""
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def sheet_grid(info: Dict[str, Any], question: str = "") -> Tuple[str, int]:
    """The sheet as numbered rows of lettered cells, plus the row count read."""
    source = str(info["source_file"])
    sheet = str(info.get("sheet_name") or "")
    grids = _read_grids(source, sheet or None, None)
    frame = next(iter(grids.values()))
    rows: List[Tuple[int, List[Tuple[str, str]]]] = []
    for position, row in enumerate(frame.itertuples(index=False), 1):
        cells = [(_column_letter(i), _cell_text(v)) for i, v in enumerate(row)]
        cells = [(c, v[:120]) for c, v in cells if v]
        if cells:
            rows.append((position, cells))
    if not rows:
        return "", 0

    wanted = set(_tokens(question))
    keep: List[int] = list(range(min(15, len(rows))))
    for i, (_, cells) in enumerate(rows):
        if i in keep:
            continue
        text = " ".join(v.lower() for _, v in cells)
        if wanted & set(_tokens(text)):
            keep.append(i)
    for i in range(len(rows)):
        if len(keep) >= GRID_MAX_ROWS:
            break
        if i not in keep:
            keep.append(i)
    keep = sorted(set(keep))[:GRID_MAX_ROWS]

    lines: List[str] = []
    used = 0
    for i in keep:
        number, cells = rows[i]
        line = f"Row {number}: " + " | ".join(f"{c}={v}" for c, v in cells)
        if used + len(line) > GRID_MAX_CHARS:
            lines.append(f"(further rows not shown; the sheet has {len(rows)} filled rows)")
            break
        lines.append(line)
        used += len(line)
    return "\n".join(lines), len(rows)


SYSTEM_PROMPT = (
    "You are a construction cost analyst reading project spreadsheets. "
    "You are given the cells of one or more sheets, row by row, as 'Row N: A=value | B=value'.\n\n"
    "RULES:\n"
    "1. Answer only from these cells. Name the file and sheet for every figure, and the row, "
    "written as (FILE.xlsx, sheet 'Name', row 12).\n"
    "2. Use each sheet's own labels. Call a figure 'Anticipated Final Cost', 'budget', "
    "'saving' or anything else only if the sheet labels it that way. If the sheet calls it "
    "'Estimated Final Cost', say Estimated Final Cost.\n"
    "3. If no sheet shows the measure asked for, say so plainly, then say what the sheets do "
    "show. Never present a different measure as the one asked for.\n"
    "4. When you add figures up, show the sum and say which rows you added. If the sheet has its "
    "own total, give that total and say whether your sum agrees with it.\n"
    "5. Header rows can span several rows and columns; read the heading above a column before "
    "naming what its numbers are.\n"
    "6. Write plain sentences. Start each section with a numbered heading on its own line, "
    "such as '1. Summary'. Use one markdown table for a breakdown, with a header row, a "
    "separator row of dashes, one row per item, and the source in the last column.\n"
    "7. Keep the answer under about 600 words. Put the main lines of a breakdown in the table, "
    "not every sub-line of the sheet."
)


def answer_from_sheets(question: str, table_names: Sequence[str],
                       tables: Dict[str, Dict[str, Any]], history: str = "",
                       ) -> Optional[Dict[str, Any]]:
    from . import llm_client
    from .document_rag import generate_doc_id

    blocks: List[str] = []
    sources: List[Dict[str, Any]] = []
    for name in table_names:
        info = tables.get(name) or {}
        try:
            grid, row_count = sheet_grid(info, question)
        except Exception as e:
            logger.warning(f"[SheetReader] cannot read {name}: {e}")
            continue
        if not grid:
            continue
        file_name = Path(str(info["source_file"])).name
        sheet = str(info.get("sheet_name") or "")
        blocks.append(f"FILE: {file_name}\nSHEET: {sheet or '(only sheet)'}\n{grid}")
        sources.append({
            "file_name": file_name,
            "file_path": str(info["source_file"]),
            "doc_id": generate_doc_id(str(info["source_file"])),
            "type": "structured_data",
            "doc_type": "data",
            "table_name": name,
            "sheet_name": sheet,
            "row_count": row_count,
        })
    if not blocks:
        return None

    history_block = (
        "CONVERSATION SO FAR (only to work out what the question refers to; not evidence):\n"
        f"{history}\n\n"
    ) if history else ""
    prompt = (
        f"{history_block}SPREADSHEET CELLS:\n\n" + "\n\n---\n\n".join(blocks)
        + f"\n\nQUESTION: {question}\n\nANSWER:"
    )
    response = llm_client.generate_text(
        prompt, system=SYSTEM_PROMPT, task_type="answer_synthesis",
        max_tokens=16384, thinking_level="low",
    )
    try:
        from .telemetry import get_current_trace
        trace = get_current_trace()
        if trace:
            trace.record_llm_call(response.usage)
    except Exception:
        pass
    return {"answer": response.text.strip(), "sources": sources}


__all__ = [
    "answer_from_sheets", "build_index", "build_index_in_background",
    "rank_sheets", "sheet_grid",
]

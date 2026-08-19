"""The shareable Chronology review pack is exact, narrow and data-free."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "build_chronology_review_pack.py"


def _build(tmp_path: Path) -> tuple[Path, bytes]:
    result = subprocess.run(
        [sys.executable, str(BUILDER), "--output-dir", str(tmp_path)],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    archive = Path(result.stdout.splitlines()[0])
    assert archive.is_file()
    return archive, archive.read_bytes()


def _unpack(archive: Path, target: Path) -> Path:
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(target)
    roots = [path for path in target.iterdir() if path.is_dir()]
    assert len(roots) == 1
    return roots[0]


def test_review_pack_is_deterministic_and_self_verifying(tmp_path: Path):
    archive, first = _build(tmp_path)
    same_archive, second = _build(tmp_path)
    assert archive == same_archive
    assert first == second

    digest = hashlib.sha256(first).hexdigest()
    checksum = archive.with_suffix(archive.suffix + ".sha256").read_text()
    assert checksum == f"{digest}  {archive.name}\n"

    subprocess.run(
        [sys.executable, str(BUILDER), "--verify", str(archive)],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )


def test_review_pack_sources_and_excerpt_spans_match_repo(tmp_path: Path):
    archive, _ = _build(tmp_path)
    pack = _unpack(archive, tmp_path / "open")
    manifest = json.loads((pack / "MANIFEST.json").read_text())

    assert manifest["source_commit"] == subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True,
    ).strip()
    assert manifest["runnable"] is False
    assert manifest["jargon_resource"]["included"] is False
    assert manifest["jargon_resource"]["entry_count"] == 2703

    for entry in manifest["entries"]:
        source = ROOT / entry["source_path"]
        bundled = pack / entry["bundle_path"]
        assert hashlib.sha256(source.read_bytes()).hexdigest() == entry["source_sha256"]
        assert hashlib.sha256(bundled.read_bytes()).hexdigest() == entry["bundle_sha256"]
        if entry["kind"] == "full_source":
            assert bundled.read_bytes() == source.read_bytes()
        else:
            source_lines = source.read_text(encoding="utf-8").splitlines(keepends=True)
            for span in entry["spans"]:
                exact = "".join(
                    source_lines[span["start_line"] - 1:span["end_line"]]
                ).rstrip("\n").encode()
                assert hashlib.sha256(exact).hexdigest() == span["sha256"]


def test_review_pack_contains_review_context_but_no_runtime_data(tmp_path: Path):
    archive, _ = _build(tmp_path)
    pack = _unpack(archive, tmp_path / "open")
    relative_files = {
        path.relative_to(pack).as_posix() for path in pack.rglob("*") if path.is_file()
    }

    required = {
        "START_HERE.md", "CURRENT_METHODOLOGY.md", "ARCHITECTURE.md",
        "REVIEW_HYPOTHESES.md", "EXTERNAL_DEPENDENCIES.md", "ASK_CLAUDE.md",
        "MANIFEST.json", "source/src/chronology_v2.py", "source/src/chronology_v3.py",
        "source/src/event_timeline.py", "source/src/report_errors.py",
        "excerpts/src/file_router.py.md",
    }
    assert required <= relative_files

    forbidden_suffixes = {
        ".db", ".sqlite", ".sqlite3", ".duckdb", ".parquet", ".pdf", ".docx",
        ".xlsx", ".xls", ".csv", ".eml", ".msg", ".env", ".pem", ".key",
    }
    forbidden_parts = {"data", "storage", "content", "uploads", "secrets", ".git"}
    for value in relative_files:
        path = PurePosixPath(value)
        assert path.suffix.casefold() not in forbidden_suffixes
        assert not ({part.casefold() for part in path.parts} & forbidden_parts)

    assert "source/config/jargon_terms.json" not in relative_files
    prompt = (pack / "ASK_CLAUDE.md").read_text()
    for requirement in (
        "V2 and V3 separately", "ingest-time event timeline", "character spans",
        "corroborating", "gold-set", "file paths and line numbers",
    ):
        assert requirement in prompt
    methodology = (pack / "CURRENT_METHODOLOGY.md").read_text()
    assert "final 18-event ceiling" in methodology
    assert "If more than 18 remain" not in methodology

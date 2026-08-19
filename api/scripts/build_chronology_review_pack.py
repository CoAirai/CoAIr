#!/usr/bin/env python3
"""Build the read-only Chronology code-review pack.

The bundle is a deterministic, allowlisted source snapshot for Claude/Codex.
It is intentionally non-runnable and never walks the repository looking for
extra files: adding a source requires an explicit entry below.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import re
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / "docs" / "internal" / "review_packs" / "chronology"
DEFAULT_OUTPUT_DIR = ROOT / "dist"
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


@dataclass(frozen=True)
class FullSource:
    path: str
    role: str
    dependencies: tuple[str, ...] = ()


@dataclass(frozen=True)
class ExcerptSource:
    path: str
    selectors: tuple[str, ...]
    role: str
    dependencies: tuple[str, ...] = ()


# Complete source files copied byte for byte. This is the primary data-exposure
# boundary: the builder never recursively copies a directory.
FULL_SOURCES = (
    FullSource(
        "src/chronology_v2.py", "Chronology V2 planning, extraction, aggregation, synthesis and verification",
        ("excerpts/src/ai_reports.py.md", "source/src/evidence_pack.py", "excerpts/src/llm_client.py.md"),
    ),
    FullSource(
        "src/chronology_v3.py", "Chronology V3 document-first research and verified report generation",
        ("source/src/document_index.py", "source/src/evidence_pack.py", "excerpts/src/llm_client.py.md"),
    ),
    FullSource(
        "src/chronology_prompts.py", "Versioned prompt loading and runtime contract validation",
        ("source/config/prompts/chronology_v2.yaml", "source/config/prompts/chronology_v3.yaml"),
    ),
    FullSource("src/evidence_pack.py", "Character/coverage evidence selection and completeness assessment"),
    FullSource("src/evidence_model.py", "Evidence, claim, chronology entry and report audit contracts"),
    FullSource(
        "src/report_docx.py", "Chronology Word renderer and output validation",
        ("source/src/evidence_model.py", "source/src/word_footnotes.py"),
    ),
    FullSource("src/word_footnotes.py", "OOXML footnote creation and relationship wiring"),
    FullSource(
        "src/document_index.py", "Project-scoped V3 document metadata index and ranking",
        ("source/src/chunk_store.py",),
    ),
    FullSource("src/chunk_store.py", "Project-scoped chunk and document-index schemas"),
    FullSource("src/lexical_index.py", "BM25/FTS retrieval and reciprocal-rank fusion"),
    FullSource("src/event_timeline.py", "Existing deterministic ingest-time event store"),
    FullSource("src/model_profiles.py", "Chronology LLM task budgets and capabilities"),
    FullSource("src/report_errors.py", "Stable allowlisted report/checkpoint error classification"),
    FullSource("src/canonical_artifacts.py", "Immutable canonical source artifacts and stable segment IDs"),
    FullSource("src/master_event_store.py", "PostgreSQL master-event repository and durable event-index queue"),
    FullSource("src/event_memory.py", "Full-document event candidate scan, structured extraction and span validation"),
    FullSource("src/event_vector_index.py", "Rebuildable project-scoped event semantic index"),
    FullSource("src/chronology_discovery.py", "Master-event-first issue chronology discovery and focused fallback"),
    FullSource("migrations/master_event/001_master_event_memory.sql", "Cloud SQL master-event schema"),
    FullSource("backend/tasks/event_index_jobs.py", "Restart-safe asynchronous event-index workers"),
    FullSource("scripts/backfill_master_events.py", "Project/document-keyed resumable legacy backfill"),
    FullSource("config/prompts/chronology_v2.yaml", "Chronology V2 prompt contract"),
    FullSource("config/prompts/chronology_v3.yaml", "Chronology V3 prompt contract"),
    FullSource(
        "frontend/src/pages/ChronologyPage.tsx", "Active chronology request and report-history UI",
        ("source/frontend/src/api/reportApi.ts",),
    ),
    FullSource(
        "frontend/src/pages/ChronologyReportPage.tsx", "Active report polling, citations and Word download UI",
        ("source/frontend/src/api/reportApi.ts",),
    ),
    FullSource("frontend/src/api/reportApi.ts", "Chronology report HTTP types and client calls"),
    FullSource("frontend/src/App.tsx", "Authenticated Chronology route wiring"),
    FullSource("tests/test_chronology_v2.py", "V2 behavioural and failure-mode tests"),
    FullSource("tests/test_chronology_v3.py", "V3 document research, pipeline and privacy tests"),
    FullSource("tests/test_evidence_pack.py", "Evidence budget, selection and coverage tests"),
    FullSource("tests/test_ai_report_footnotes.py", "Claim-level footnote and DOCX validation tests"),
    FullSource("tests/test_durable_job_stores.py", "Durable job sequence, scope and checkpoint tests"),
    FullSource("tests/test_demo_model_policy.py", "Account pipeline/model policy tests"),
    FullSource("tests/test_master_event_memory.py", "Canonical source, span, version and purge tests"),
    FullSource("tests/test_chronology_event_discovery.py", "Master-first and focused-fallback discovery tests"),
    FullSource("tests/test_event_search_architecture.py", "Vectorless search and storage-isolation contract tests"),
    FullSource("tests/test_master_event_postgres_contract.py", "Opt-in Cloud SQL/PostgreSQL adapter contract test"),
    FullSource("tests/test_chronology_event_discovery.py", "Master-first and scoped-fallback tests"),
)


# Mixed application files are reduced to exact AST nodes. The generated files
# are Markdown, not pretend-runnable modules, and record every original span.
EXCERPT_SOURCES = (
    ExcerptSource(
        "backend/api/reports.py",
        (
            "ChronologyGenerateRequest", "_assert_ready", "_assert_chronology_enabled",
            "_chronology_pipeline", "_public", "preview_chronology_sources",
            "generate_chronology_report", "list_reports", "get_report", "retry_report",
            "resolve_report_source", "download_report",
        ),
        "Chronology request, queue, status, retry, source and download endpoints",
        ("excerpts/backend/tasks/report_jobs.py.md", "excerpts/src/ai_reports.py.md"),
    ),
    ExcerptSource(
        "backend/tasks/report_jobs.py",
        ("DB_PATH", "_SCHEMA", "_now", "ReportJobStore", "_worker", "start_report_workers",
         "stop_report_workers", "get_report_job_store"),
        "Durable report schema/store and the Chronology worker branch",
        ("excerpts/src/ai_reports.py.md",),
    ),
    ExcerptSource(
        "src/ai_reports.py",
        (
            "PROMPT_VERSION", "MODEL_POLICY", "_source_id", "_to_evidence",
            "_rank_normalised", "retrieve_evidence", "_evidence_payload",
            "_chronology_schema", "_claim_supported", "_generate_chronology_v2",
            "generate_chronology",
        ),
        "Shared V2 orchestration plus dense/BM25/adjacent-page evidence retrieval",
        ("source/src/chronology_v2.py", "source/src/chronology_v3.py", "excerpts/src/document_rag.py.md"),
    ),
    ExcerptSource(
        "src/llm_client.py",
        (
            "BillingRecordingError", "LLMIncompleteResponseError",
            "LLMInvalidStructuredOutputError", "LLMInputBudgetExceededError",
            "LLMResearchBudgetExceededError", "begin_chronology_call_budget",
            "set_chronology_call_budget", "end_chronology_call_budget",
            "_model_for_task", "generate_text", "generate_response_json",
            "_validate_with_model", "_structured_text_validator",
        ),
        "Structured LLM gateway, validation, model routing and chronology call context",
        ("source/src/model_profiles.py",),
    ),
    ExcerptSource(
        "src/jargon_manager.py",
        (
            "jargon_dictionary_version", "PreparedQuery", "JargonManager.retrieval_sense",
            "JargonManager.prepare_query", "JargonManager.find_matching_terms",
            "get_jargon_manager", "prepare_query", "set_current_prepared_query",
            "reset_current_prepared_query",
        ),
        "Shared terminology query preparation and ambiguity handling",
    ),
    ExcerptSource(
        "src/file_router.py",
        (
            "ProcessingResult", "route_file", "_index_document_metadata", "_index_data_document",
            "_prepare_event_artifact", "_process_document", "_process_email", "delete_document",
        ),
        "Upload integration, canonical artifact creation, queueing and complete purge",
        ("source/src/canonical_artifacts.py", "source/src/master_event_store.py"),
    ),
    ExcerptSource(
        "src/document_rag.py",
        (
            "DocumentRAG.query", "DocumentRAG._hybrid_query", "DocumentRAG._dense_candidates",
            "DocumentRAG._llm_rerank", "DocumentRAG._node_to_source",
            "DocumentRAG._lexical_terms",
        ),
        "Dense/hybrid retrieval and reranking surface called by V2",
        ("source/src/lexical_index.py", "source/src/chunk_store.py"),
    ),
)


TEMPLATE_FILES = (
    "START_HERE.md", "CURRENT_METHODOLOGY.md", "ARCHITECTURE.md",
    "REVIEW_HYPOTHESES.md", "EXTERNAL_DEPENDENCIES.md", "ASK_CLAUDE.md",
)

FORBIDDEN_SUFFIXES = {
    ".db", ".sqlite", ".sqlite3", ".duckdb", ".parquet", ".pdf", ".docx",
    ".xlsx", ".xls", ".csv", ".eml", ".msg", ".env", ".pem", ".key", ".p12",
}
FORBIDDEN_PARTS = {"data", "storage", "content", "uploads", "secrets", ".git", "cache"}
SECRET_PATTERNS = (
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"\bAIza[0-9A-Za-z_-]{30,}\b"),
    re.compile(rb"\bsk-[0-9A-Za-z_-]{20,}\b"),
    re.compile(rb"\bghp_[0-9A-Za-z]{20,}\b"),
    re.compile(rb"\bAKIA[0-9A-Z]{16}\b"),
)
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _git(*args: str) -> str:
    return subprocess.check_output(
        ["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL,
    ).strip()


def _source_revision() -> tuple[str, str]:
    return _git("rev-parse", "HEAD"), _git("show", "-s", "--format=%cI", "HEAD")


def _git_blob(commit: str, path: str) -> bytes:
    try:
        return subprocess.check_output(
            ["git", "show", f"{commit}:{path}"], cwd=ROOT, stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"source is not present at revision {commit}: {path}") from exc


def _assert_sources_match_revision(commit: str) -> None:
    paths = {item.path for item in FULL_SOURCES} | {item.path for item in EXCERPT_SOURCES}
    drifted = [
        path for path in sorted(paths)
        if (ROOT / path).read_bytes() != _git_blob(commit, path)
    ]
    if drifted:
        raise ValueError(
            "review-pack sources have uncommitted changes; commit or restore them first: "
            + ", ".join(drifted)
        )


def _jargon_metadata() -> tuple[int, str, str]:
    path = ROOT / "config" / "jargon_terms.json"
    raw = path.read_bytes()
    values = json.loads(raw)
    examples = []
    for term in ("SOW", "EOT", "NOD", "SDS"):
        if term in values:
            examples.append(f"- `{term}` — {values[term]}")
    return len(values), _sha256(raw), "\n".join(examples)


def _render_template(text: str, *, commit: str, jargon_count: int,
                     jargon_hash: str, jargon_examples: str) -> str:
    replacements = {
        "{{SOURCE_COMMIT}}": commit,
        "{{JARGON_TERM_COUNT}}": str(jargon_count),
        "{{JARGON_SHA256}}": jargon_hash,
        "{{JARGON_EXAMPLES}}": jargon_examples,
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    if "{{" in text or "}}" in text:
        raise ValueError("unresolved review-pack template placeholder")
    return text


def _assignment_name(node: ast.AST) -> str | None:
    targets: list[ast.expr] = []
    if isinstance(node, ast.Assign):
        targets = list(node.targets)
    elif isinstance(node, ast.AnnAssign):
        targets = [node.target]
    for target in targets:
        if isinstance(target, ast.Name):
            return target.id
    return None


def _node_name(node: ast.AST) -> str | None:
    if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
        return node.name
    return _assignment_name(node)


def _find_selector(tree: ast.Module, selector: str) -> ast.AST:
    parts = selector.split(".")
    body: Iterable[ast.AST] = tree.body
    current: ast.AST | None = None
    for part in parts:
        current = next((node for node in body if _node_name(node) == part), None)
        if current is None:
            raise ValueError(f"source selector not found: {selector}")
        body = getattr(current, "body", ())
    return current


def _node_span(node: ast.AST) -> tuple[int, int]:
    start = int(getattr(node, "lineno"))
    decorators = getattr(node, "decorator_list", ())
    if decorators:
        start = min(start, *(int(item.lineno) for item in decorators))
    end = int(getattr(node, "end_lineno"))
    return start, end


def _build_excerpt(spec: ExcerptSource) -> tuple[bytes, list[dict], str]:
    source_path = ROOT / spec.path
    raw = source_path.read_bytes()
    text = raw.decode("utf-8")
    lines = text.splitlines(keepends=True)
    tree = ast.parse(text, filename=spec.path)
    blocks: list[str] = [
        f"# Verbatim excerpts from `{spec.path}`\n",
        "This file is non-runnable. Each block is copied exactly from the named source "
        "revision; use the original line span when citing it.\n",
    ]
    spans: list[dict] = []
    for selector in spec.selectors:
        node = _find_selector(tree, selector)
        start, end = _node_span(node)
        snippet = "".join(lines[start - 1:end]).rstrip("\n")
        snippet_bytes = snippet.encode("utf-8")
        spans.append({
            "selector": selector,
            "start_line": start,
            "end_line": end,
            "sha256": _sha256(snippet_bytes),
        })
        blocks.extend((
            f"\n## `{selector}` — original lines {start}–{end}\n",
            "```python\n",
            snippet,
            "\n```\n",
        ))
    return "".join(blocks).encode("utf-8"), spans, _sha256(raw)


def _safe_relative(path: str) -> PurePosixPath:
    pure = PurePosixPath(path)
    if pure.is_absolute() or ".." in pure.parts:
        raise ValueError(f"unsafe bundle path: {path}")
    if pure.suffix.casefold() in FORBIDDEN_SUFFIXES:
        raise ValueError(f"forbidden file type in bundle: {path}")
    if {part.casefold() for part in pure.parts} & FORBIDDEN_PARTS:
        raise ValueError(f"forbidden path segment in bundle: {path}")
    return pure


def _scan_bytes(path: str, data: bytes) -> None:
    if len(data) > 2_000_000:
        raise ValueError(f"unexpectedly large review-pack file: {path}")
    if b"\x00" in data:
        raise ValueError(f"binary content rejected: {path}")
    for pattern in SECRET_PATTERNS:
        if pattern.search(data):
            raise ValueError(f"possible credential rejected: {path}")


def _write_file(root: Path, relative: str, data: bytes) -> Path:
    pure = _safe_relative(relative)
    _scan_bytes(relative, data)
    destination = root.joinpath(*pure.parts)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return destination


def _validate_links(pack_root: Path) -> None:
    for markdown in pack_root.rglob("*.md"):
        text = markdown.read_text(encoding="utf-8")
        # Verbatim source excerpts legitimately contain regex constructs such
        # as ``[...](...)``. They are not Markdown links, so inspect prose only.
        prose = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
        for target in MARKDOWN_LINK_RE.findall(prose):
            value = target.strip().split("#", 1)[0]
            if not value or value.startswith(("http://", "https://", "mailto:")):
                continue
            candidate = (markdown.parent / value).resolve()
            try:
                candidate.relative_to(pack_root.resolve())
            except ValueError as exc:
                raise ValueError(f"link escapes pack: {markdown.name} -> {target}") from exc
            if not candidate.exists():
                raise ValueError(f"broken pack link: {markdown.name} -> {target}")


def _validate_manifest(pack_root: Path, manifest: dict) -> None:
    targets = {entry["bundle_path"] for entry in manifest["entries"]}
    commit = str(manifest["source_commit"])
    for entry in manifest["entries"]:
        bundled = pack_root / entry["bundle_path"]
        if not bundled.is_file():
            raise ValueError(f"manifest target missing: {entry['bundle_path']}")
        if _sha256(bundled.read_bytes()) != entry["bundle_sha256"]:
            raise ValueError(f"manifest hash mismatch: {entry['bundle_path']}")
        committed = _git_blob(commit, entry["source_path"])
        if _sha256(committed) != entry["source_sha256"]:
            raise ValueError(f"source drift detected: {entry['source_path']}")
        unresolved = set(entry.get("dependencies", ())) - targets
        if unresolved:
            raise ValueError(
                f"manifest dependency missing for {entry['bundle_path']}: {sorted(unresolved)}"
            )


def _validate_tree(pack_root: Path, manifest: dict) -> None:
    allowed = {entry["bundle_path"] for entry in manifest["entries"]}
    allowed.update(TEMPLATE_FILES)
    allowed.add("MANIFEST.json")
    actual: set[str] = set()
    for path in pack_root.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(pack_root).as_posix()
        _safe_relative(relative)
        _scan_bytes(relative, path.read_bytes())
        actual.add(relative)
    unexpected = actual - allowed
    missing = allowed - actual
    if unexpected or missing:
        raise ValueError(
            f"bundle allowlist mismatch; unexpected={sorted(unexpected)}, missing={sorted(missing)}"
        )
    _validate_links(pack_root)
    _validate_manifest(pack_root, manifest)


def _zip_tree(pack_root: Path, destination: Path) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.unlink()
    with zipfile.ZipFile(
        destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9,
    ) as archive:
        for path in sorted(pack_root.rglob("*"), key=lambda item: item.as_posix()):
            if not path.is_file():
                continue
            relative = path.relative_to(pack_root.parent).as_posix()
            info = zipfile.ZipInfo(relative, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED,
                             compresslevel=9)
    return _sha256(destination.read_bytes())


def build(output_dir: Path = DEFAULT_OUTPUT_DIR) -> tuple[Path, str]:
    commit, commit_date = _source_revision()
    _assert_sources_match_revision(commit)
    jargon_count, jargon_hash, jargon_examples = _jargon_metadata()
    package_dir_name = f"chronology-review-pack-{commit[:12]}"
    entries: list[dict] = []

    with tempfile.TemporaryDirectory(prefix="chronology-review-pack-") as temp:
        pack_root = Path(temp) / package_dir_name
        pack_root.mkdir()

        for name in TEMPLATE_FILES:
            source = TEMPLATE_DIR / name
            rendered = _render_template(
                source.read_text(encoding="utf-8"), commit=commit,
                jargon_count=jargon_count, jargon_hash=jargon_hash,
                jargon_examples=jargon_examples,
            ).encode("utf-8")
            _write_file(pack_root, name, rendered)

        for spec in FULL_SOURCES:
            source = ROOT / spec.path
            if not source.is_file():
                raise FileNotFoundError(spec.path)
            raw = source.read_bytes()
            bundle_path = f"source/{spec.path}"
            _write_file(pack_root, bundle_path, raw)
            entries.append({
                "kind": "full_source",
                "source_path": spec.path,
                "bundle_path": bundle_path,
                "source_sha256": _sha256(raw),
                "bundle_sha256": _sha256(raw),
                "role": spec.role,
                "dependencies": list(spec.dependencies),
            })

        for spec in EXCERPT_SOURCES:
            rendered, spans, source_hash = _build_excerpt(spec)
            bundle_path = f"excerpts/{spec.path}.md"
            _write_file(pack_root, bundle_path, rendered)
            entries.append({
                "kind": "verbatim_excerpt",
                "source_path": spec.path,
                "bundle_path": bundle_path,
                "source_sha256": source_hash,
                "bundle_sha256": _sha256(rendered),
                "role": spec.role,
                "dependencies": list(spec.dependencies),
                "spans": spans,
            })

        manifest = {
            "package": "chronology-technical-review-pack",
            "purpose": "Read-only Claude/Codex architecture and provenance review",
            "source_commit": commit,
            "source_commit_date": commit_date,
            "generated_from_clean_allowlist": True,
            "runnable": False,
            "jargon_resource": {
                "included": False,
                "entry_count": jargon_count,
                "sha256": jargon_hash,
                "representative_terms": ["SOW", "EOT", "NOD", "SDS"],
            },
            "entries": sorted(entries, key=lambda item: item["bundle_path"]),
        }
        manifest_bytes = (json.dumps(
            manifest, ensure_ascii=False, indent=2, sort_keys=True,
        ) + "\n").encode("utf-8")
        _write_file(pack_root, "MANIFEST.json", manifest_bytes)
        _validate_tree(pack_root, manifest)

        destination = output_dir.resolve() / f"{package_dir_name}.zip"
        archive_hash = _zip_tree(pack_root, destination)

    verify_archive(destination)
    checksum_path = destination.with_suffix(destination.suffix + ".sha256")
    checksum_path.write_text(f"{archive_hash}  {destination.name}\n", encoding="utf-8")
    return destination, archive_hash


def verify_archive(path: Path) -> None:
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    with tempfile.TemporaryDirectory(prefix="chronology-review-verify-") as temp:
        root = Path(temp)
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)):
                raise ValueError("duplicate archive members")
            for info in archive.infolist():
                pure = PurePosixPath(info.filename)
                if pure.is_absolute() or ".." in pure.parts:
                    raise ValueError(f"unsafe archive member: {info.filename}")
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError(f"symlink rejected: {info.filename}")
            archive.extractall(root)
        top_levels = {PurePosixPath(name).parts[0] for name in names if name}
        if len(top_levels) != 1:
            raise ValueError("archive must have exactly one root directory")
        pack_root = root / next(iter(top_levels))
        manifest = json.loads((pack_root / "MANIFEST.json").read_text(encoding="utf-8"))
        _validate_tree(pack_root, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--verify", type=Path, help="verify an existing review-pack ZIP")
    args = parser.parse_args()
    if args.verify:
        verify_archive(args.verify)
        print(f"verified: {args.verify.resolve()}")
        return 0
    destination, digest = build(args.output_dir)
    print(destination)
    print(f"sha256:{digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

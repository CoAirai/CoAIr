"""Multi-stage research and evidence-pack pipeline for construction chronologies."""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from typing import Callable, Dict, Iterable, List, Sequence, Tuple

from pydantic import BaseModel, Field

from .chronology_prompts import chronology_prompt_hash, load_chronology_prompts
from .evidence_model import ChronologyEntry, EvidenceItem, VerifiedClaim
from .jargon_manager import (
    jargon_dictionary_version, prepare_query, set_current_prepared_query,
)
from .report_errors import classify_report_error, diagnostic_summary


PIPELINE_VERSION = "chronology-v2"
EVIDENCE_BATCH_CHARS = 80_000
EXTRACTION_WINDOW_CHARS = 12_000
# How many candidate documents the preview lists for the analyst. Presentation
# only — what the report reads is decided by evidence_pack.select_pack.
MAX_PREVIEW_DOCUMENTS = 20

SYNTHESIS_BATCH_EVENTS = 12
VERIFICATION_BATCH_CLAIMS = 30
ALLOWED_DATE_SOURCES = {
    "content_header", "content_body", "table_period", "unresolved",
}
MAX_EVENT_CLAIMS = 4
MAX_OVERVIEW_CLAIMS = 5

COVERAGE_FACETS: Dict[str, Tuple[str, ...]] = {
    "contractual_framework": ("contract", "agreement", "obligation", "clause", "scope"),
    "programme_baseline": ("programme", "schedule", "baseline", "milestone", "completion"),
    "design_access_interfaces": ("design", "access", "utility", "interface", "consent"),
    "instructions_notices_change": ("instruction", "notice", "change", "variation", "departure"),
    "party_positions": ("asserted", "contended", "responded", "position", "disputed"),
    "delay_prolongation": ("delay", "stoppage", "prolongation", "late", "disruption"),
    "dispute_resolution": ("dispute", "adjudication", "mediation", "settlement", "resolution"),
    "contradictions_missing": ("inconsistent", "contradict", "missing", "unavailable", "not recorded"),
}


class ResearchPlanModel(BaseModel):
    english_topic: str
    parties: List[str] = Field(default_factory=list, max_length=30)
    contracts: List[str] = Field(default_factory=list, max_length=30)
    work_packages: List[str] = Field(default_factory=list, max_length=30)
    exclusions: List[str] = Field(default_factory=list, max_length=30)
    queries: List[str] = Field(min_length=4, max_length=16)


class ClaimModel(BaseModel):
    text: str
    source_ids: List[str] = Field(min_length=1, max_length=3)
    counter_source_ids: List[str] = Field(default_factory=list, max_length=3)
    is_inference: bool = False
    inference_basis: str = ""
    confidence: str = "medium"


class EventModel(BaseModel):
    cluster_id: str = ""
    event_date: str = ""
    date_precision: str = "unknown"
    date_source: str = Field(
        default="unresolved", json_schema_extra={"enum": sorted(ALLOWED_DATE_SOURCES)},
        description="Source of the quoted event date; never use metadata or text as a value.",
    )
    date_evidence: str = Field(
        default="", description="Verbatim source wording including the year needed to prove event_date.",
    )
    claims: List[ClaimModel] = Field(min_length=1, max_length=MAX_EVENT_CLAIMS)
    parties: List[str] = Field(default_factory=list, max_length=20)
    event_type: str = "event"
    conflicting_positions: List[str] = Field(default_factory=list, max_length=10)


class ExtractionModel(BaseModel):
    entries: List[EventModel] = Field(default_factory=list)


class ChronologyModel(BaseModel):
    overview_claims: List[ClaimModel] = Field(min_length=1, max_length=MAX_OVERVIEW_CLAIMS)
    entries: List[EventModel] = Field(default_factory=list)


class DraftChronologyModel(BaseModel):
    """Compatibility name for callers that inspect the synthesis model."""
    overview_claims: List[ClaimModel] = Field(min_length=1, max_length=MAX_OVERVIEW_CLAIMS)
    entries: List[EventModel] = Field(default_factory=list)


class OverviewModel(BaseModel):
    overview_claims: List[ClaimModel] = Field(min_length=1, max_length=MAX_OVERVIEW_CLAIMS)


class EventSynthesisModel(BaseModel):
    entries: List[EventModel] = Field(default_factory=list, max_length=SYNTHESIS_BATCH_EVENTS)


class VerificationDecisionModel(BaseModel):
    claim_ref: str
    supported: bool
    reason_code: str = "supported"


class VerificationModel(BaseModel):
    decisions: List[VerificationDecisionModel] = Field(min_length=1, max_length=40)


@dataclass(frozen=True)
class PreparedChronologyQuery:
    original_query: str
    english_query: str
    jargon_matches: Tuple[Tuple[str, str], ...]
    parties: Tuple[str, ...]
    contracts: Tuple[str, ...]
    work_packages: Tuple[str, ...]
    exclusions: Tuple[str, ...]
    research_queries: Tuple[str, ...]


def _hash(value: object) -> str:
    raw = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _is_structured_output_error(exc: Exception) -> bool:
    """Only truncated, malformed or oversized output is safe to batch-split."""
    return exc.__class__.__name__ in {
        "LLMIncompleteResponseError", "LLMInvalidStructuredOutputError",
        "LLMInputBudgetExceededError",
    } or any(marker in str(exc).casefold() for marker in (
        "model_output_incomplete", "model_output_invalid", "input_budget_exceeded",
    ))


def _claims_are_source_valid(value: Dict, evidence: Sequence[EvidenceItem]) -> bool:
    """Reject invented source IDs, numbers and quotations before caching."""
    by_id = {item.source_id: item.excerpt.casefold() for item in evidence}
    entries = list(value.get("entries", []))
    if "overview_claims" in value:
        entries.append({"claims": value.get("overview_claims", [])})
    for event in entries:
        for claim in event.get("claims", []):
            source_ids = [str(item) for item in claim.get("source_ids", [])]
            if not source_ids or len(source_ids) > 3 or any(sid not in by_id for sid in source_ids):
                return False
            counter_ids = [str(item) for item in claim.get("counter_source_ids", [])]
            if len(counter_ids) > 3 or any(sid not in by_id for sid in counter_ids):
                return False
            source_text = " ".join(by_id[sid] for sid in source_ids)
            text = str(claim.get("text") or "").casefold()
            numbers = [number.rstrip(".,") for number in re.findall(r"(?<![a-z])\d[\d,.%/-]*", text)]
            if any(number not in source_text for number in numbers):
                return False
            ambiguous_days = re.findall(
                r"\b(\d{1,2})(?:st|nd|rd|th)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})\b",
                " ".join(source_text.split()),
            )
            if ambiguous_days:
                # An ambiguous OCR day must not survive as a factual date in
                # the narrative after its event-date field has been cleared.
                for date in re.finditer(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})\b", text):
                    if not any(int(date[1]) in (int(first), int(second)) and date[2][:3] == month[:3] and date[3] == year
                               for first, second, month, year in ambiguous_days):
                        continue
                    parsed = None
                    for fmt in ("%d %B %Y", "%d %b %Y"):
                        try:
                            parsed = datetime.strptime(" ".join(date.groups()), fmt)
                            break
                        except ValueError:
                            pass
                    if parsed is not None and not _date_proven({
                        "event_date": parsed.strftime("%Y-%m-%d"), "date_precision": "exact",
                        "date_source": "content_body", "date_evidence": date.group(), "claims": [claim],
                    }, evidence):
                        return False
            quotations = re.findall(r'["“]([^"”]{3,})["”]', str(claim.get("text") or ""))
            if any(quote.casefold().strip() not in source_text for quote in quotations):
                return False
    return True


def _date_matches_quote(event_date: str, precision: str, quote: str) -> bool:
    """Normalize only date wording actually present in the supplied quotation."""
    names = ("january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december")
    months = {alias: i for i, name in enumerate(names, 1) for alias in (name, name[:3])}
    months["sept"] = 9
    candidates = set()
    def add(year, month=1, day=1, depth=3):
        try:
            year = datetime.strptime(str(year), "%y").year if len(str(year)) == 2 else int(year)
            value = datetime(year, int(month), int(day)).strftime("%Y-%m-%d")
            candidates.add(value[:{1:4, 2:7, 3:10}[depth]])
        except ValueError:
            pass
    for year, month, day in re.findall(r"\b(\d{4})-(\d{2})-(\d{2})\b", quote):
        add(year, month, day)
    for day, month, year in re.findall(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b", quote):
        add(year, month, day)
    for day, month, year in re.findall(r"\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]+)\.?[,]?[\s-]+(\d{4}|\d{2})\b", quote):
        if month.lower() in months:
            add(year, months[month.lower()], day)
    for month, day, year in re.findall(r"\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b", quote):
        if month.lower() in months:
            add(year, months[month.lower()], day)
    for month, year in re.findall(r"\b([A-Za-z]+)\.?\s+(\d{4})\b", quote):
        if month.lower() in months:
            add(year, months[month.lower()], depth=2)
    for year, month in re.findall(r"\b(\d{4})-(\d{2})\b", quote):
        add(year, month, depth=2)
    if precision == "year":
        return bool(re.search(r"(?<!\d)" + re.escape(event_date) + r"(?!\d)", quote))
    return any(value.startswith(event_date) for value in candidates)


def _date_proven(event: Dict, evidence: Sequence[EvidenceItem]) -> bool:
    event_date = str(event.get("event_date") or "").strip()
    date_source = str(event.get("date_source") or "unresolved")
    date_evidence = str(event.get("date_evidence") or "").strip()
    precision = str(event.get("date_precision") or "unknown").casefold()
    patterns = {
        "exact": r"\d{4}-\d{2}-\d{2}",
        "day": r"\d{4}-\d{2}-\d{2}",
        "month": r"\d{4}-\d{2}",
        "year": r"\d{4}",
    }
    if not event_date:
        return date_source == "unresolved" and not date_evidence
    if date_source not in ALLOWED_DATE_SOURCES - {"unresolved"}:
        return False
    pattern = patterns.get(precision)
    if (not pattern or not re.fullmatch(pattern, event_date) or not date_evidence
            or not _date_matches_quote(event_date, precision, date_evidence)):
        return False
    by_id = {item.source_id: item.excerpt.casefold() for item in evidence}
    source_ids = {
        str(source_id) for claim in event.get("claims", [])
        for source_id in claim.get("source_ids", [])
    }
    # OCR and PDF line wrapping may change whitespace, never the quoted words.
    quote = " ".join(date_evidence.casefold().split())
    for source_id in source_ids:
        text = " ".join(by_id.get(source_id, "").split())
        ambiguous = []
        if precision in {"exact", "day"}:
            # Broken OCR such as "1st 11 April 2007" must not be silently
            # interpreted as 11 April by matching only its trailing words.
            ambiguous = [match.span() for match in re.finditer(
                r"\b\d{1,2}(?:st|nd|rd|th)\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s+\d{4}\b", text,
            )]
        for match in re.finditer(re.escape(quote), text):
            if not any(match.start() < end and match.end() > start for start, end in ambiguous):
                return True
    return False


def _enforce_event_date(event: Dict, evidence: Sequence[EvidenceItem]) -> Dict:
    value = dict(event)
    if not _date_proven(value, evidence):
        value.update({
            "event_date": "", "date_precision": "unknown",
            "date_source": "unresolved", "date_evidence": "",
        })
    elif not value.get("event_date"):
        value.update({
            "date_precision": "unknown", "date_source": "unresolved",
            "date_evidence": "",
        })
    elif str(value.get("date_precision") or "").casefold() == "day":
        value["date_precision"] = "exact"
    return value


def _prune_source_invalid_claims(value: Dict, evidence: Sequence[EvidenceItem]) -> Dict:
    """Keep supported claims instead of rejecting an otherwise usable draft.

    Structured generation can produce one over-specific number or quotation in
    an otherwise source-grounded chronology.  Rejecting the complete response
    makes retries reproduce the same defect.  This deterministic pass removes
    only the offending claim (or its now-empty event); the independent verifier
    still audits every retained claim before rendering.
    """
    validated = ChronologyModel.model_validate(value).model_dump()
    overview = [
        claim for claim in validated.get("overview_claims", [])
        if _claims_are_source_valid({"overview_claims": [claim], "entries": []}, evidence)
    ]
    entries: List[Dict] = []
    for event in validated.get("entries", []):
        claims = [
            claim for claim in event.get("claims", [])
            if _claims_are_source_valid({"entries": [{"claims": [claim]}]}, evidence)
        ]
        if claims:
            entries.append(_enforce_event_date({**event, "claims": claims}, evidence))
    if not overview:
        raise ValueError("source_verification_failed")
    if not entries:
        raise ValueError("insufficient_evidence")
    return {"overview_claims": overview, "entries": entries}


def _prune_source_invalid_events(value: Dict, evidence: Sequence[EvidenceItem]) -> List[Dict]:
    """Apply the same claim-level safety rule to extraction/aggregation output."""
    validated = ExtractionModel.model_validate(value).model_dump()
    entries: List[Dict] = []
    for event in validated.get("entries", []):
        claims = [
            claim for claim in event.get("claims", [])
            if _claims_are_source_valid({"entries": [{"claims": [claim]}]}, evidence)
        ]
        if claims:
            entries.append(_enforce_event_date({**event, "claims": claims}, evidence))
    return entries


def _corpus_revision(project_id: str, doc_ids: Sequence[str] = ()) -> str:
    try:
        from .chunk_store import get_chunk_store
        con = get_chunk_store().connection()
        if doc_ids:
            marks = ",".join("?" for _ in doc_ids)
            rows = con.execute(
                f"SELECT doc_id,file_name,page_number,text FROM chunks WHERE project_id=? "
                f"AND doc_id IN ({marks}) ORDER BY doc_id,page_number,text",
                [project_id, *doc_ids],
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT doc_id,file_name,page_number,text FROM chunks WHERE project_id=? "
                "ORDER BY doc_id,page_number,text", [project_id],
            ).fetchall()
        digest = hashlib.sha256()
        for row in rows:
            digest.update("|".join(str(v or "") for v in row).encode("utf-8"))
        return digest.hexdigest()
    except Exception:
        return hashlib.sha256(project_id.encode()).hexdigest()


def _fallback_queries(topic: str) -> List[str]:
    return [
        f"{topic} contract scope obligations and applicable clauses",
        f"{topic} baseline programme milestones and expected sequence",
        f"{topic} design access utilities interfaces and approvals",
        f"{topic} instructions notices changes and correspondence",
        f"{topic} contemporaneous positions taken by each party",
        f"{topic} delay disruption work stoppage and prolongation records",
        f"{topic} dispute adjudication mediation settlement or outcome",
        f"{topic} contradictions missing records and unresolved dates",
    ]


def _project_domain_hint(project_id: str) -> str:
    """The project's name, used to pick between senses of an ambiguous term.

    On the Edinburgh Tram corpus "SDS" must read as System Design Services,
    not the HSE's Safety Data Sheet; the glossary tags each sense with the
    domain it came from, so the project name is the disambiguator. Failure to
    resolve is not an error — the glossary then falls back to the generic
    sense, which is what it did before this existed.
    """
    from .jargon_manager import project_domain_hint
    return project_domain_hint(project_id)


def prepare_chronology_query(
    topic: str, *, date_from: str = "", date_to: str = "",
    parties: Sequence[str] = (), project_id: str = "",
) -> PreparedChronologyQuery:
    clean_topic = str(topic or "").strip()
    if len(clean_topic) < 3:
        raise ValueError("chronology_topic_required")
    domain_hint = _project_domain_hint(project_id)
    jargon = prepare_query(clean_topic, domain_hint=domain_hint)
    project_terms = {}
    project_jargon_hash = ""
    if project_id:
        try:
            from .event_memory import project_jargon_version
            from .master_event_store import get_master_event_store
            event_store = get_master_event_store()
            project_terms = event_store.approved_project_terms(project_id)
            project_jargon_hash = project_jargon_version(project_id, event_store)
        except Exception:
            project_terms = {}
    matched_project_terms = [
        (term, meaning) for term, meaning in project_terms.items()
        if term.casefold() in clean_topic.casefold()
    ]
    project_jargon_context = "\n".join(
        f"- PROJECT TERM {term}: {meaning}" for term, meaning in matched_project_terms[:20]
    )
    set_current_prepared_query(jargon)
    prompts = load_chronology_prompts()
    prompt = (
        f"{prompts['research_planner']}\n\n"
        f"ORIGINAL TOPIC: {clean_topic}\n"
        f"DATE RANGE: {date_from or 'open'} to {date_to or 'open'}\n"
        f"NAMED PARTIES: {', '.join(parties) or 'not specified'}\n"
        f"{jargon.context}\n{project_jargon_context}"
    )
    try:
        from .llm_client import generate_response_json
        response = generate_response_json(
            prompt, system=prompts["system"],
            schema=ResearchPlanModel.model_json_schema(), schema_name="chronology_research_plan",
            validation_model=ResearchPlanModel,
            task_type="chronology_research_plan", thinking_level="low", max_tokens=4_096,
            prompt_version=prompts["version"], ttl_s=86_400,
            cache_key="chron-plan", cache_context=(
                f"{_corpus_revision(project_id) if project_id else ''}:"
                f"{jargon_dictionary_version()}:{project_jargon_hash}"
            ),
        )
        plan = ResearchPlanModel.model_validate(response.raw)
    except Exception:
        plan = ResearchPlanModel(
            english_topic=clean_topic,
            parties=list(parties), queries=_fallback_queries(clean_topic),
        )
    queries: List[str] = []
    for query in plan.queries:
        expanded = prepare_query(query, domain_hint=domain_hint)
        for variant in expanded.retrieval_queries[:2]:
            if variant.strip() and variant not in queries:
                queries.append(variant.strip())
    for term, meaning in matched_project_terms:
        variant = f"{plan.english_topic or clean_topic} {term} {meaning}"
        if variant not in queries:
            queries.append(variant)
    return PreparedChronologyQuery(
        original_query=clean_topic, english_query=plan.english_topic.strip() or clean_topic,
        jargon_matches=tuple([*jargon.matches, *matched_project_terms]), parties=tuple(plan.parties or parties),
        contracts=tuple(plan.contracts), work_packages=tuple(plan.work_packages),
        exclusions=tuple(plan.exclusions), research_queries=tuple(queries[:24]),
    )


def coverage_matrix(evidence: Sequence[EvidenceItem]) -> Dict[str, int]:
    text = "\n".join(item.excerpt for item in evidence).casefold()
    return {
        facet: sum(text.count(term.casefold()) for term in terms)
        for facet, terms in COVERAGE_FACETS.items()
    }


def source_preview(
    project_id: str, prepared: PreparedChronologyQuery,
    retrieve: Callable[[str, Sequence[str]], List[EvidenceItem]],
) -> Dict:
    from .chronology_discovery import discover_chronology_evidence

    def fallback(queries: Sequence[str], doc_ids: Sequence[str]) -> List[EvidenceItem]:
        try:
            return retrieve(project_id, queries, doc_ids=doc_ids)
        except TypeError:  # compatibility with injected/test retrieval callables
            return retrieve(project_id, queries)

    discovery = discover_chronology_evidence(
        project_id=project_id, prepared=prepared, fallback=fallback,
    )
    evidence = discovery.evidence
    coverage = coverage_matrix(evidence)
    missing = [facet for facet, hits in coverage.items() if hits == 0]
    for _ in range(2):
        if not missing:
            break
        gap_queries = [
            f"{prepared.english_query} {facet.replace('_', ' ')} evidence"
            for facet in missing
        ]
        scope = (list(discovery.audit.get("incomplete_doc_ids", []))
                 or list(discovery.selected_doc_ids))
        extra = fallback(gap_queries, scope)
        merged = {item.source_id: item for item in [*evidence, *extra]}
        evidence = list(merged.values())
        coverage = coverage_matrix(evidence)
        missing = [facet for facet, hits in coverage.items() if hits == 0]

    # Show the analyst the documents the report would actually read. Two things
    # were wrong here. Documents were keyed by (doc_id, file_name), but a doc_id
    # is a fragment — one file averages ~14 of them — so a "document" row was a
    # fragment row. And the per-document score was a SUM over passages, which
    # ranked a document by how much of it matched rather than how well, handing
    # the top places to whatever was longest.
    from .evidence_pack import select_pack

    selection = select_pack(evidence, facets=COVERAGE_FACETS, max_chars=None)
    selected_ids = {item.source_id for item in selection.evidence}

    docs: Dict[str, Dict] = {}
    for item in evidence:
        key = item.file_name or item.doc_id
        row = docs.setdefault(key, {
            "doc_id": item.doc_id, "file_name": item.file_name,
            "score": 0.0, "pages": set(), "source_count": 0,
            "doc_ids": set(), "selected": False, "selected_chars": 0,
        })
        # Best passage, not the sum of them.
        row["score"] = max(row["score"], max(0.0, float(item.score)))
        if item.page:
            row["pages"].add(item.page)
        row["source_count"] += 1
        if item.doc_id:
            row["doc_ids"].add(item.doc_id)
        if item.source_id in selected_ids:
            row["selected"] = True
            row["selected_chars"] += len(item.excerpt or "")

    documents = sorted(
        docs.values(), key=lambda row: (-row["score"], row["file_name"]),
    )[:MAX_PREVIEW_DOCUMENTS]
    for row in documents:
        row["pages"] = sorted(row["pages"])
        row["doc_ids"] = sorted(row["doc_ids"])
        row["score"] = round(row["score"], 6)

    # Coverage of the pack that would be read, not of everything retrieval saw.
    pack_coverage = coverage_matrix(selection.evidence)
    pack_missing = [facet for facet, hits in pack_coverage.items() if hits == 0]
    return {
        "prepared": asdict(prepared), "documents": documents,
        "coverage": pack_coverage,
        "coverage_status": "complete" if not pack_missing else "partial",
        "selection": selection.stats,
        "corpus_revision": _corpus_revision(project_id),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "event_discovery": discovery.audit,
        "partial_reasons": list(discovery.audit.get("partial_reasons", [])),
    }


def evidence_from_documents(project_id: str, doc_ids: Sequence[str]) -> List[EvidenceItem]:
    """Read the given documents whole.

    There is no cap on how many an analyst may choose. There used to be one —
    twenty — which was a proxy for cost that did not work: a document here runs
    from 16 to 290,294 characters, so twenty of them could be anything. Cost is
    bounded where it belongs, by the character budget in evidence_pack, and the
    caller applies that after this returns.
    """
    chosen = [str(value).strip() for value in doc_ids if str(value).strip()]
    if not chosen:
        raise ValueError("source_document_selection_invalid")
    from .chunk_store import get_chunk_store
    marks = ",".join("?" for _ in chosen)
    rows = get_chunk_store().connection().execute(
        f"SELECT doc_id,file_name,page_number,text FROM chunks WHERE project_id=? "
        f"AND doc_id IN ({marks}) ORDER BY file_name,page_number,chunk_id",
        [project_id, *chosen],
    ).fetchall()
    found = {str(row[0]) for row in rows}
    if found != set(chosen):
        raise ValueError("source_document_not_in_project")
    evidence: List[EvidenceItem] = []
    for doc_id, file_name, page, text in rows:
        for offset in range(0, len(text or ""), 3_500):
            excerpt = str(text or "")[offset:offset + 3_500].strip()
            if not excerpt:
                continue
            sid = "src_" + hashlib.sha256(
                f"{project_id}|{doc_id}|{page}|{offset}|{excerpt}".encode()
            ).hexdigest()[:16]
            evidence.append(EvidenceItem(
                source_id=sid, doc_id=str(doc_id), file_name=str(file_name),
                title=str(file_name), page=int(page or 1), excerpt=excerpt,
            ))
    return evidence


def evidence_markdown(evidence: Sequence[EvidenceItem]) -> str:
    lines: List[str] = []
    last_doc = None
    last_page = None
    for item in evidence:
        if item.doc_id != last_doc:
            lines.extend((f"# Document: {item.file_name}", f"Document-ID: {item.doc_id}"))
            last_doc, last_page = item.doc_id, None
        if item.page != last_page:
            lines.append(f"\n## Page {item.page or 'unknown'}")
            last_page = item.page
        lines.extend((f"\n[source_id={item.source_id}]", item.excerpt))
    return "\n".join(lines)


def evidence_batches(evidence: Sequence[EvidenceItem], max_chars: int = EVIDENCE_BATCH_CHARS) -> List[List[EvidenceItem]]:
    batches: List[List[EvidenceItem]] = []
    current: List[EvidenceItem] = []
    size = 0
    for item in evidence:
        item_size = len(evidence_markdown([item])) + 1
        if item_size > max_chars:
            raise ValueError("evidence_passage_exceeds_batch_budget")
        if current and size + item_size > max_chars:
            batches.append(current); current = []; size = 0
        current.append(item); size += item_size
    if current:
        batches.append(current)
    return batches


def occurrence_windows(item: EvidenceItem) -> List[EvidenceItem]:
    """Keep each explicit programme target with its preceding task wording.

    Source IDs continue to identify the original cited page. The exact window
    text participates in the extraction hash, so distinct rows cannot share a
    cached extraction just because they cite the same page.
    """
    targets = list(re.finditer(
        r"(?im)^[ \t]*Complete(?:[ \t]+by[ \t]+[^\n]+|[ \t]+\d+[ \t]+weeks?[ \t]+after[^\n]*)(?:\n|$)",
        item.excerpt,
    ))
    if len(targets) < 2:
        return [item]
    windows = []
    start = 0
    for index, target in enumerate(targets):
        end = len(item.excerpt) if index == len(targets) - 1 else target.end()
        windows.append(replace(item, excerpt=item.excerpt[start:end]))
        start = end
    return windows


def _restore_programme_target_dates(entries: List[Dict], batch: Sequence[EvidenceItem]) -> List[Dict]:
    """Recover quoted schedule dates, preserving month precision for end/mid.

    The event's own claim and cited source must repeat the date wording.
    This never borrows discovery metadata or fills a missing year. The independent
    verifier still checks the temporal link of every claim in the final event.
    """
    by_id = {item.source_id: item for item in batch}
    names = "January February March April May June July August September October November December".split()
    months = {alias.lower(): i for i, name in enumerate(names, 1) for alias in (name, name[:3])}
    month_pattern = "|".join(sorted(months, key=len, reverse=True))
    pattern = re.compile(
        rf"(?i)\b(?:(\d{{1,2}})(?:st|nd|rd|th)?\s+|(?:end|mid)(?:\s+of)?\s+)?({month_pattern})\s+(\d{{4}})\b"
    )
    for event in entries:
        if event.get("event_date"):
            continue
        proposals = {}
        for claim in event.get("claims", []):
            for source_id in claim.get("source_ids", []):
                source = by_id.get(source_id)
                if source is None:
                    continue
                targets = re.findall(r"(?im)^[ \t]*Complete[ \t]+by[ \t]+([^\n]+)", source.excerpt)
                # A planned agreement may state a month in prose rather than
                # a Complete-by row. Admit only wording repeated by the claim
                # and proved verbatim in its own cited source; never fill a year.
                matches = list(pattern.finditer(targets[0] if len(targets) == 1 else source.excerpt))
                for match in matches:
                    day, month, year = match.groups()
                    month_number = months[month.lower()]
                    proposed = {**event, "event_date": f"{year}-{month_number:02d}" + (f"-{int(day):02d}" if day else ""),
                                "date_precision": "exact" if day else "month", "date_source": "content_body",
                                "date_evidence": match.group()}
                    if (_date_matches_quote(proposed["event_date"], proposed["date_precision"], claim["text"])
                            and _date_proven(proposed, [source])):
                        proposals[proposed["event_date"]] = proposed
        if len(proposals) == 1:
            proposed = next(iter(proposals.values()))
            event.update({key: proposed[key] for key in ("event_date", "date_precision", "date_source", "date_evidence")})
    return entries


def extract_batch(
    *, batch: Sequence[EvidenceItem], prepared: PreparedChronologyQuery,
    cache_context: str,
) -> List[Dict]:
    prompts = load_chronology_prompts()
    from .llm_client import generate_response_json
    prompt = (
        f"TOPIC: {prepared.english_query}\n"
        f"PARTIES: {', '.join(prepared.parties) or 'not specified'}\n"
        f"{prompts['extractor']}\n\nEVIDENCE BEGIN\n"
        f"{evidence_markdown(batch)}\nEVIDENCE END"
    )
    response = generate_response_json(
        prompt, system=prompts["system"], schema=ExtractionModel.model_json_schema(),
        schema_name="chronology_evidence_extraction", task_type="chronology_extract",
        validation_model=ExtractionModel,
        thinking_level="low", max_tokens=16_384, prompt_version=prompts["version"],
        cache_key="chronology-extract", cache_context=cache_context, ttl_s=0,
    )
    return _restore_programme_target_dates(_prune_source_invalid_events(response.raw, batch), batch)


def extract_batches(
    evidence: Sequence[EvidenceItem], prepared: PreparedChronologyQuery,
    *, load_step: Callable[[str, str], Dict | None] | None = None,
    save_step: Callable[[str, str, str, Dict | None, str], None] | None = None,
    job_scope: str = "", stats: Dict | None = None,
) -> List[Dict]:
    """Extract candidate events from every evidence batch.

    A batch that the model cannot answer is split in half and both halves are
    retried. Losing one half of the evidence is not a reason to lose the other:
    what survives is returned, and what did not is counted in `stats` so the
    report can say so instead of presenting a thin record as a complete one.
    Only a non-structured failure (auth, network, budget) aborts the run — those
    are systemic and retrying smaller pieces cannot help.
    """
    from threading import Lock
    counter_lock = Lock()
    counters = stats if stats is not None else {}
    counters.setdefault("batches_total", 0)
    counters.setdefault("batches_failed", 0)
    counters.setdefault("passages_dropped", 0)
    counters.setdefault("batch_errors", [])

    def fail(batch: List[EvidenceItem], key: str, input_hash: str,
             exc: Exception) -> None:
        # Record what actually went wrong. Upstream this was flattened to the
        # constant "model_output_incomplete" for truncation, malformed JSON and
        # oversized input alike, which made the three indistinguishable in the
        # step table — and truncation was usually the wrong guess.
        error_code = classify_report_error(exc)
        counters["batches_failed"] += 1
        counters["passages_dropped"] += len(batch)
        if len(counters["batch_errors"]) < 10:
            counters["batch_errors"].append({
                "step": key, "error_code": error_code,
                "detail": diagnostic_summary(exc),
            })
        if save_step:
            save_step(key, input_hash, "failed", None, error_code)

    def run(batch: List[EvidenceItem], key: str, output: List[Dict], depth: int = 0) -> None:
        from .llm_client import _model_for_task
        input_hash = _hash({
            "evidence": evidence_markdown(batch),
            "topic": prepared.english_query, "parties": prepared.parties,
            "model": _model_for_task("chronology_extract"),
            "jargon": jargon_dictionary_version(), "policy": "source-occurrences-v5",
            "prompt": chronology_prompt_hash(),
            "schema": ExtractionModel.model_json_schema(),
        })
        previous = load_step(key, input_hash) if load_step else None
        if previous and previous.get("status") == "ready":
            cached = previous.get("output") or {}
            try:
                ExtractionModel.model_validate(cached)
                valid = _prune_source_invalid_events(cached, batch)
                reusable = (bool(valid) and len(valid) == len(cached.get("entries", []))
                            and _claims_are_source_valid(cached, batch))
            except Exception:
                reusable = False
            if reusable:
                output.extend(valid)
                with counter_lock:
                    counters["batches_reused"] = counters.get("batches_reused", 0) + 1
                if save_step:
                    save_step(key, input_hash, "ready", {"entries": valid}, "")
                return
        if save_step:
            save_step(key, input_hash, "processing", None, "")
        try:
            entries = extract_batch(
                batch=batch, prepared=prepared,
                cache_context=(
                    f"{job_scope}:{chronology_prompt_hash()}:"
                    f"{jargon_dictionary_version()}:{input_hash}"
                ),
            )
            if save_step:
                save_step(key, input_hash, "ready", {"entries": entries}, "")
            output.extend(entries)
        except Exception as exc:
            if not _is_structured_output_error(exc):
                raise
            if len(batch) > 1 and depth < 8:
                middle = len(batch) // 2
                # Both halves, independently. Previously the first half's
                # failure propagated out of this frame and the second half was
                # never attempted at all, silently discarding it — which is why
                # no step key ending in "b" has ever been recorded in
                # production. run() now only raises for systemic errors, which
                # should abort the whole run anyway.
                run(batch[:middle], key + "a", output, depth + 1)
                run(batch[middle:], key + "b", output, depth + 1)
                return
            with counter_lock:
                fail(batch, key, input_hash, exc)

    # Retrieval rank can vary between identical searches. Extraction reads all
    # chosen evidence, so use stable source/page order for coherent reads and
    # content-addressed reuse without discarding a lower-ranked passage.
    ordered = sorted(evidence, key=lambda item: (item.file_name, item.page or 0, item.doc_id, item.source_id))
    # A source page must not disappear inside a larger document's context.
    # Read each page independently in small windows; this is a per-call
    # budget, never a cap on the number of documents or report events.
    documents: Dict[Tuple[str, int | None], List[EvidenceItem]] = {}
    for item in ordered:
        documents.setdefault((item.doc_id, item.page), []).append(item)
    batches = []
    for document in documents.values():
        for batch in evidence_batches(document, max_chars=EXTRACTION_WINDOW_CHARS):
            if any(len(occurrence_windows(item)) > 1 for item in batch):
                batches.extend([window] for item in batch for window in occurrence_windows(item))
            else:
                batches.append(batch)
    counters["batches_total"] = len(batches)
    def read_one(index, batch):
        output: List[Dict] = []
        run(list(batch), f"extract:{index}", output)
        return output

    # Match the existing synthesis concurrency; preserve input order on merge.
    with ThreadPoolExecutor(max_workers=min(3, max(1, len(batches)))) as pool:
        futures = [pool.submit(copy_context().run, read_one, index, batch)
                   for index, batch in enumerate(batches, 1)]
        return [event for future in futures for event in future.result()]


def _event_key(raw: Dict) -> Tuple[str, str]:
    text = " ".join(str(c.get("text") or "") for c in raw.get("claims", []))
    normal = re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()
    return str(raw.get("event_date") or ""), normal


def _cluster_events(events: Sequence[Dict]) -> List[Dict]:
    """Cluster exact duplicate observations without transferring provenance."""
    clustered: Dict[Tuple[str, str], Dict] = {}
    for raw in events:
        event = deepcopy(raw)
        existing_observations = deepcopy(event.pop("observations", []))
        observation = {
            key: deepcopy(event.get(key)) for key in (
                "event_date", "date_precision", "date_source", "date_evidence", "claims",
            )
        }
        observations = existing_observations or [observation]
        key = _event_key(event)
        current = clustered.get(key)
        if current is None:
            event["observations"] = observations
            event["cluster_id"] = "evt_" + _hash({
                "key": key, "observations": observations,
            })[:16]
            clustered[key] = event
            continue
        current.setdefault("observations", []).extend(observations)
        for field in ("parties", "conflicting_positions"):
            current[field] = list(dict.fromkeys([
                *current.get(field, []), *event.get(field, []),
            ]))
    return list(clustered.values())


def _candidate_source_ids(event: Dict) -> set[str]:
    observations = event.get("observations") or [event]
    return {
        str(source_id) for observation in observations
        for claim in observation.get("claims", [])
        for source_id in [
            *claim.get("source_ids", []), *claim.get("counter_source_ids", []),
        ]
    }


def _synthesis_batches(
    events: Sequence[Dict], evidence: Sequence[EvidenceItem], *, max_chars: int = 180_000,
    max_events: int | None = SYNTHESIS_BATCH_EVENTS,
) -> List[List[Dict]]:
    by_id = {item.source_id: item for item in evidence}
    batches: List[List[Dict]] = []
    current: List[Dict] = []
    current_ids: set[str] = set()
    size = 0
    for event in events:
        event_ids = _candidate_source_ids(event)
        added_ids = event_ids - current_ids
        added_size = len(json.dumps(event, ensure_ascii=False)) + sum(
            len(by_id[source_id].excerpt) + 160
            for source_id in added_ids if source_id in by_id
        )
        if current and (
            (max_events is not None and len(current) >= max_events) or size + added_size > max_chars
        ):
            batches.append(current); current = []; current_ids = set(); size = 0
            added_ids = event_ids
            added_size = len(json.dumps(event, ensure_ascii=False)) + sum(
                len(by_id[source_id].excerpt) + 160
                for source_id in added_ids if source_id in by_id
            )
        current.append(event); current_ids.update(event_ids); size += added_size
    if current:
        batches.append(current)
    return batches


def aggregate_candidates(
    *, prepared: PreparedChronologyQuery, candidates: Sequence[Dict],
    evidence: Sequence[EvidenceItem],
    load_step: Callable[[str, str], Dict | None] | None = None,
    save_step: Callable[[str, str, str, Dict | None, str], None] | None = None,
) -> List[Dict]:
    """Deterministically cluster exact observations without dropping events."""
    return _cluster_events(candidates)


def synthesize(
    *, prepared: PreparedChronologyQuery, candidates: Sequence[Dict],
    evidence: Sequence[EvidenceItem], cache_context: str,
    load_step: Callable[[str, str], Dict | None] | None = None,
    save_step: Callable[[str, str, str, Dict | None, str], None] | None = None,
) -> Dict:
    prompts = load_chronology_prompts()
    from .llm_client import generate_response_json
    ordered = sorted(_cluster_events(candidates), key=lambda item: (
        str(item.get("event_date") or "9999-99-99"), _event_key(item)[1]
    ))
    used_ids = {source_id for event in ordered for source_id in _candidate_source_ids(event)}
    selected = [item for item in evidence if item.source_id in used_ids]
    base = (
        f"TOPIC: {prepared.english_query}\n"
        f"PARTIES: {', '.join(prepared.parties) or 'not specified'}\n"
        f"CONTRACTS: {', '.join(prepared.contracts) or 'not established'}\n"
        f"{prompts['synthesizer']}\n{prompts['style_profile']}"
    )

    def call_step(
        step_key: str, input_hash: str, prompt: str, *, schema_name: str,
        validation_model: type[BaseModel], semantic_validator=None,
    ) -> Dict:
        previous = load_step(step_key, input_hash) if load_step else None
        if previous and previous.get("status") == "ready":
            candidate = dict(previous.get("output") or {})
            try:
                validation_model.model_validate(candidate)
            except Exception:
                candidate = {}
            if candidate and (semantic_validator is None or semantic_validator(candidate)):
                return candidate
        if save_step:
            save_step(step_key, input_hash, "processing", None, "")
        try:
            response = generate_response_json(
                prompt, system=prompts["system"],
                schema=validation_model.model_json_schema(), schema_name=schema_name,
                task_type="chronology_synthesis", validation_model=validation_model,
                thinking_level="medium", max_tokens=32_768,
                prompt_version=prompts["version"], cache_key=schema_name,
                cache_context=f"{cache_context}:{input_hash}", ttl_s=0,
                semantic_validator=semantic_validator,
            )
        except Exception as exc:
            if save_step:
                save_step(step_key, input_hash, "failed", None, classify_report_error(exc))
            raise
        output = dict(response.raw)
        try:
            validation_model.model_validate(output)
            if semantic_validator is not None and not semantic_validator(output):
                raise ValueError("model_output_invalid")
        except Exception as exc:
            if save_step:
                save_step(step_key, input_hash, "failed", None, classify_report_error(exc))
            raise ValueError("model_output_invalid") from exc
        if save_step:
            save_step(step_key, input_hash, "ready", output, "")
        return output

    def synthesize_overview(events: List[Dict], level: int = 0) -> Dict:
        # Only the overview is reduced. Every event is still written separately
        # below; summary compression must never become event omission.
        chunks = _synthesis_batches(events, evidence, max_chars=120_000, max_events=None)
        if len(chunks) > 1:
            summaries = []
            for number, chunk in enumerate(chunks, 1):
                part = overview_call(chunk, f"synthesis:overview:{level}:{number}")
                summaries.extend({"claims": [claim]} for claim in part.get("overview_claims", []))
            if len(summaries) >= len(events):
                raise ValueError("overview_reduction_did_not_converge")
            return synthesize_overview(summaries, level + 1)
        return overview_call(events, "synthesis:overview" if level == 0 else f"synthesis:overview:reduce:{level}")

    def overview_call(events: List[Dict], step_key: str) -> Dict:
        ids = {sid for event in events for sid in _candidate_source_ids(event)}
        context = [item for item in selected if item.source_id in ids]
        input_hash = _hash({
            "clusters": events, "evidence": [asdict(item) for item in context],
            "prompt": chronology_prompt_hash(), "schema": OverviewModel.model_json_schema(),
        })
        overview_prompt = (
            f"{base}\n\nCreate only the sourced overview; do not return dated events.\n\n"
            f"EVENT CLUSTERS:\n{json.dumps(events, ensure_ascii=False)}\n\n"
            f"EVIDENCE BEGIN\n{evidence_markdown(context)}\nEVIDENCE END"
        )
        return call_step(step_key, input_hash, overview_prompt, schema_name="chronology_v2_overview",
                         validation_model=OverviewModel)

    def synthesize_batch(batch_number: int, batch: List[Dict]) -> List[Dict]:
        expected_ids = {str(item["cluster_id"]) for item in batch}
        batch_ids = {source_id for event in batch for source_id in _candidate_source_ids(event)}
        batch_evidence = [item for item in evidence if item.source_id in batch_ids]

        def batch_valid(value: Dict, expected: set[str] = expected_ids) -> bool:
            values = value.get("entries", [])
            returned = [str(item.get("cluster_id") or "") for item in values]
            return (
                len(returned) == len(expected) and set(returned) == expected
            )

        input_hash = _hash({
            "clusters": batch, "evidence": [asdict(item) for item in batch_evidence],
            "prompt": chronology_prompt_hash(),
            "schema": EventSynthesisModel.model_json_schema(),
        })
        prompt = (
            f"{base}\n\nCreate exactly one final event for every cluster_id in this batch. "
            "Return each cluster_id unchanged; do not omit, combine or invent cluster IDs.\n\n"
            f"EVENT CLUSTERS:\n{json.dumps(batch, ensure_ascii=False)}\n\n"
            f"EVIDENCE BEGIN\n{evidence_markdown(batch_evidence)}\nEVIDENCE END"
        )
        output = call_step(
            f"synthesis:event:{batch_number}",
            input_hash, prompt, schema_name="chronology_v2_event_batch",
            validation_model=EventSynthesisModel, semantic_validator=batch_valid,
        )
        entries = list(output.get("entries", []))
        proven = {str(event["cluster_id"]): event for event in batch
                  if event.get("event_date") and _date_proven(event, batch_evidence)}
        for event in entries:
            original = proven.get(str(event.get("cluster_id")))
            if original:
                # Drafting may reword a claim, but cannot erase or replace a
                # proven candidate date. Final citation/date checks still run.
                for field in ("event_date", "date_precision", "date_source", "date_evidence"):
                    event[field] = original[field]
        return entries

    # These drafts use independent evidence batches. Keep provider concurrency
    # bounded and collect in batch order; every claim is still verified below.
    with ThreadPoolExecutor(max_workers=3) as pool:
        overview_future = pool.submit(
            copy_context().run, synthesize_overview, ordered,
        )
        event_futures = [
            pool.submit(copy_context().run, synthesize_batch, number, batch)
            for number, batch in enumerate(_synthesis_batches(ordered, evidence), 1)
        ]
        overview = overview_future.result()
        entries = [entry for future in event_futures for entry in future.result()]

    draft = {
        "overview_claims": overview.get("overview_claims", []),
        "entries": sorted(entries, key=lambda item: (
            str(item.get("event_date") or "9999-99-99"), str(item.get("cluster_id") or ""),
        )),
    }
    # Keep source-supported claims before the independent verifier; one invalid
    # claim must not reject a usable batch before this safety pass can run.
    return _prune_source_invalid_claims(draft, selected)


def verify_claims(
    *, prepared: PreparedChronologyQuery, chronology: Dict,
    evidence: Sequence[EvidenceItem], cache_context: str,
    load_step: Callable[[str, str], Dict | None] | None = None,
    save_step: Callable[[str, str, str, Dict | None, str], None] | None = None,
) -> Dict[str, bool]:
    """Run the independent claim/source audit over the synthesized draft."""
    prompts = load_chronology_prompts()
    claims: List[Dict] = []
    for index, claim in enumerate(chronology.get("overview_claims", [])):
        claims.append({"claim_ref": f"overview:{index}", **claim})
    for event_index, event in enumerate(chronology.get("entries", [])):
        if event.get("event_date"):
            claims.append({
                "claim_ref": f"date:{event_index}", "verification_kind": "event_date",
                "event_date": event["event_date"], "date_precision": event.get("date_precision"),
                "date_source": event.get("date_source"), "date_evidence": event.get("date_evidence"),
                "text": " ".join(str(c.get("text") or "") for c in event.get("claims", [])),
                "source_ids": sorted({sid for c in event.get("claims", []) for sid in c.get("source_ids", [])}),
            })
        for claim_index, claim in enumerate(event.get("claims", [])):
            if event.get("event_date") and len(event.get("claims", [])) > 1:
                claims.append({
                    "claim_ref": f"date:{event_index}:{claim_index}", "verification_kind": "event_date",
                    "event_date": event["event_date"], "date_precision": event.get("date_precision"),
                    "date_source": event.get("date_source"), "date_evidence": event.get("date_evidence"),
                    "text": claim.get("text", ""), "source_ids": claim.get("source_ids", []),
                })
            claims.append({"claim_ref": f"event:{event_index}:{claim_index}", **claim})
    if not claims:
        raise ValueError("insufficient_evidence")
    from .llm_client import generate_response_json
    combined: Dict[str, bool] = {}
    for offset in range(0, len(claims), VERIFICATION_BATCH_CLAIMS):
        batch = claims[offset:offset + VERIFICATION_BATCH_CLAIMS]
        refs = {str(claim["claim_ref"]) for claim in batch}
        used_ids = {
            str(source_id) for claim in batch
            for source_id in [
                *claim.get("source_ids", []), *claim.get("counter_source_ids", []),
            ]
        }
        cited = [item for item in evidence if item.source_id in used_ids]
        input_hash = _hash({
            "claims": batch, "evidence": [asdict(item) for item in cited],
            "prompt": chronology_prompt_hash(), "schema": VerificationModel.model_json_schema(),
        })
        step_key = f"verification:batch:{offset // VERIFICATION_BATCH_CLAIMS + 1}"
        previous = load_step(step_key, input_hash) if load_step else None
        if previous and previous.get("status") == "ready":
            raw = dict(previous.get("output") or {})
        else:
            prompt = (
                f"TOPIC: {prepared.english_query}\n{prompts['verifier']}\n\n"
                f"CLAIMS:\n{json.dumps(batch, ensure_ascii=False)}\n\n"
                f"EVIDENCE BEGIN\n{evidence_markdown(cited)}\nEVIDENCE END\n\n"
                "For verification_kind=event_date, approve only if the quoted date normalizes to event_date "
                "and explicitly dates ALL the event's assertions. A date on a cover, design programme or "
                "retrospective witness statement does not date subsequent works or quantities. If any "
                "assertion has no proven temporal link, reject the date decision; the factual claims "
                "are judged separately and may remain as undated evidence. "
                "Return exactly one decision for every claim_ref. Use reason_code values such as "
                "supported, missing_source, number_not_found, quotation_not_found, date_conflict, "
                "unattributed_position or unsupported_causation."
            )

            def decisions_valid(value: Dict, expected: set[str] = refs) -> bool:
                decisions = value.get("decisions", [])
                return len(decisions) == len(expected) and {
                    str(item.get("claim_ref") or "") for item in decisions
                } == expected

            if save_step:
                save_step(step_key, input_hash, "processing", None, "")
            try:
                response = generate_response_json(
                    prompt, system=prompts["system"], schema=VerificationModel.model_json_schema(),
                    schema_name="chronology_claim_verification", task_type="chronology_verify",
                    validation_model=VerificationModel, thinking_level="low", max_tokens=8_192,
                    prompt_version=prompts["version"], cache_key="chronology-verification",
                    cache_context=f"{cache_context}:{input_hash}",
                    semantic_validator=decisions_valid, ttl_s=0,
                )
            except Exception as exc:
                if save_step:
                    save_step(step_key, input_hash, "failed", None, classify_report_error(exc))
                raise
            raw = dict(response.raw)
            if save_step:
                save_step(step_key, input_hash, "ready", raw, "")
        try:
            VerificationModel.model_validate(raw)
        except Exception as exc:
            if save_step:
                save_step(step_key, input_hash, "failed", None, classify_report_error(exc))
            raise ValueError("model_output_invalid") from exc
        for item in raw.get("decisions", []):
            combined[str(item["claim_ref"])] = bool(item["supported"])
    if set(combined) != {str(claim["claim_ref"]) for claim in claims}:
        raise ValueError("source_verification_failed")
    return combined


__all__ = [
    "PIPELINE_VERSION", "PreparedChronologyQuery", "coverage_matrix",
    "aggregate_candidates", "evidence_batches", "evidence_from_documents", "evidence_markdown",
    "extract_batches", "prepare_chronology_query", "source_preview", "synthesize",
    "verify_claims",
]

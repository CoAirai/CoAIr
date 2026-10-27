"""Evidence-grounded AI generation for the existing Chronology/Forensic modules."""

from __future__ import annotations

import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from dataclasses import asdict, replace
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from .llm_client import _model_for_task
from .evidence_model import ChronologyEntry, EvidenceItem, VerifiedClaim
from .evidence_pack import assess_pack, select_pack
from .report_docx import FORENSIC_SECTIONS, build_ai_chronology_docx, build_forensic_report_docx


PROMPT_VERSION = "chronology-v2"
FORENSIC_PROMPT_VERSION = "evidence-report-v1"
MODEL_POLICY = "quality-demo-v1"

DEFAULT_RESEARCH_QUESTIONS = [
    "What is the starting point of the issue?",
    "Which contract or obligation applies?",
    "Which events and correspondence occurred?",
    "What positions did the parties take?",
    "Which dates are exact and which are inferred?",
    "Are there conflicting or missing records?",
    "What later event or outcome followed?",
]

_SYSTEM = """You are preparing an evidence-led construction dispute report.
Use only the supplied evidence objects. Keep facts, party allegations, and
inferences distinct. Never invent a document identifier, date, person, number,
quotation, entitlement, causation conclusion, delay duration, or critical path
calculation. Every factual claim must cite one or more supplied source_id values.
If the record does not establish a point, state that the record is not
established. Produce professional English suitable for solicitor review."""


def build_research_plan(topic: str, date_from: str = "", date_to: str = "",
                        parties: Sequence[str] = ()) -> List[str]:
    from .jargon_manager import prepare_query, set_current_prepared_query
    prepared = prepare_query(topic)
    set_current_prepared_query(prepared)
    prompt = (
        "Create a compact research plan for this chronology/report topic. "
        "Return JSON as {\"questions\":[...]} with 7-10 non-overlapping questions. "
        "Write every research question in English, regardless of the input language.\n"
        f"Topic: {topic}\nDate range: {date_from or 'open'} to {date_to or 'open'}\n"
        f"Parties: {', '.join(parties) or 'not specified'}\n{prepared.context}"
    )
    try:
        from .config import GEMINI_MODEL_LITE
        from .llm_client import generate_json
        response = generate_json(
            prompt, system="You are a fast legal-document research planner. JSON only.",
            provider="gemini", model=GEMINI_MODEL_LITE,
            cache_key="chron-plan:" + hashlib.sha256(prompt.encode()).hexdigest()[:24],
            task_type="research_plan",
        )
        questions = response.raw.get("questions", []) if isinstance(response.raw, dict) else []
        questions = [str(q).strip() for q in questions if str(q).strip()]
        if len(questions) >= 4:
            return questions[:10]
    except Exception:
        pass
    return list(DEFAULT_RESEARCH_QUESTIONS)


def _source_id(project_id: str, doc_id: str, anchor: str, excerpt: str) -> str:
    return "src_" + hashlib.sha256(
        f"{project_id}|{doc_id}|{anchor}|{excerpt}".encode("utf-8")
    ).hexdigest()[:16]


def _to_evidence(project_id: str, source: Dict) -> EvidenceItem | None:
    file_name = str(source.get("file_name") or source.get("doc_name") or "").strip()
    doc_id = str(source.get("doc_id") or file_name).strip()
    text = str(source.get("text") or source.get("text_snippet")
               or source.get("highlight_text") or "").strip()
    if not file_name or not text:
        return None
    try:
        page = int(source.get("page_number") or 1)
    except Exception:
        page = 1
    kind = "email" if file_name.lower().endswith((".eml", ".msg")) else (
        "excel" if file_name.lower().endswith((".xlsx", ".xls", ".csv")) else "document"
    )
    excerpt = text
    if kind == "excel":
        anchor = (
            f"sheet:{source.get('sheet') or ''}|rows:"
            f"{source.get('row_from') or ''}-{source.get('row_to') or source.get('row_from') or ''}"
        )
    elif kind == "email":
        anchor = f"email:{source.get('subject') or ''}"
    else:
        anchor = f"page:{page}"
    if source.get("chunk_id") or source.get("evidence_offset"):
        anchor += f"|chunk:{source.get('chunk_id') or ''}|offset:{source.get('evidence_offset', 0)}"
    sid = _source_id(project_id, doc_id, anchor, excerpt)
    return EvidenceItem(
        source_id=sid, doc_id=doc_id, file_name=file_name,
        title=str(source.get("title") or file_name),
        document_date=str(source.get("date") or source.get("document_date") or ""),
        page=page if kind == "document" else None, kind=kind,
        sender=str(source.get("sender") or ""), recipient=str(source.get("recipient") or ""),
        subject=str(source.get("subject") or ""), sheet=str(source.get("sheet") or ""),
        row_from=source.get("row_from"), row_to=source.get("row_to"),
        excerpt=excerpt, score=float(source.get("score") or source.get("lex_score") or 0.0),
    )


def _rank_normalised(rows: Sequence[Dict]) -> List[Dict]:
    """Put one lane's results on a 0..1 scale so lanes can be compared.

    The lanes return incompatible quantities: RRF fusion scores (~0.03), raw
    cosine (0..1) and raw BM25 (unbounded, commonly 1..15). Merging them by
    `max` let BM25 win every contest by magnitude alone, and summing them per
    document — which chronology selection did — ranked documents by how
    lexically verbose they were.

    Each lane already returns its own results best-first, so position is the one
    signal that means the same thing everywhere. Normalising by rank discards
    magnitude deliberately: the magnitudes were not comparable, and a made-up
    common scale would be worse than an honest ordinal one.
    """
    total = len(rows)
    if not total:
        return []
    out: List[Dict] = []
    for position, row in enumerate(rows):
        item = dict(row)
        item["lane_score"] = row.get("score", row.get("lex_score"))
        item["score"] = (total - position) / total
        out.append(item)
    return out


def retrieve_evidence(project_id: str, questions: Sequence[str], top_k: int = 12,
                      doc_ids: Sequence[str] = (), *, stats: Optional[Dict] = None) -> List[EvidenceItem]:
    """Run dense/hybrid and lexical lanes concurrently per research question."""
    from .document_rag import get_document_rag
    from .lexical_index import get_lexical_index
    from .project_context import set_current_project

    if not project_id:
        raise ValueError("project_required")
    set_current_project(project_id, "editor")
    rag = get_document_rag()
    lexical = get_lexical_index()

    audit = stats if stats is not None else {}
    audit.update({"queries": [], "lane_errors": []})

    def dense(question: str) -> List[Dict]:
        from .jargon_manager import set_current_prepared_query
        set_current_prepared_query(question)
        return (rag.query(
            question, top_k=top_k, synthesize=False, rerank=True,
            project_id=project_id, doc_ids=list(doc_ids) or None,
        ) or {}).get("sources", [])

    def bm25(question: str) -> List[Dict]:
        return lexical.search_chunks(
            question, top_k=top_k, project_id=project_id,
            doc_ids=list(doc_ids) or None,
        )

    # Planning and rag.query already expand terminology. Avoid duplicate work
    # and carry user, project, billing and progress context into each worker.
    questions = list(dict.fromkeys(q.strip() for q in questions if q.strip()))
    collected: List[Dict] = []
    with ThreadPoolExecutor(max_workers=min(6, max(2, len(questions) * 2))) as pool:
        futures = [(question, lane, pool.submit(copy_context().run, function, question))
                   for question in questions for lane, function in (("dense", dense), ("bm25", bm25))]
        for question, lane, future in futures:
            try:
                rows = _rank_normalised(future.result())
                collected.extend(rows)
                audit["queries"].append({"query":question, "lane":lane, "hits":len(rows)})
            except Exception as exc:
                audit["lane_errors"].append({"query":question, "lane":lane,
                                              "error_type":type(exc).__name__})
    collected.sort(key=lambda row: float(row.get("score") or 0.0), reverse=True)
    from .report_source_expansion import expand_report_sources
    try:
        from .chunk_store import get_chunk_store
        con = get_chunk_store().connection()
    except Exception:
        con = None
    try:
        from .document_registry import get_document_registry
        registry = get_document_registry()
    except Exception:
        registry = None
    collected = expand_report_sources(project_id, collected, con=con,
                                      registry=registry, doc_ids=doc_ids, stats=audit)
    by_id: Dict[str, EvidenceItem] = {}
    for raw in collected:
        item = _to_evidence(project_id, raw)
        if item is None:
            continue
        current = by_id.get(item.source_id)
        if current is None or item.score > current.score:
            by_id[item.source_id] = item
    audit["evidence_passages"] = len(by_id)
    audit["evidence_characters"] = sum(len(item.excerpt) for item in by_id.values())
    return sorted(by_id.values(), key=lambda x: x.score, reverse=True)


def _evidence_payload(evidence: Sequence[EvidenceItem]) -> str:
    return json.dumps([asdict(e) for e in evidence], ensure_ascii=False)


def _chronology_schema() -> Dict:
    claim = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "text": {"type": "string"},
            "source_ids": {"type": "array", "items": {"type": "string"}},
            "is_inference": {"type": "boolean"},
            "inference_basis": {"type": "string"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        },
        "required": ["text", "source_ids", "is_inference", "inference_basis", "confidence"],
    }
    entry = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "event_date": {"type": "string"},
            "date_precision": {"type": "string", "enum": ["exact", "month", "year", "inferred", "unknown"]},
            "claims": {"type": "array", "items": claim},
            "parties": {"type": "array", "items": {"type": "string"}},
            "event_type": {"type": "string"},
            "conflicting_positions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["event_date", "date_precision", "claims", "parties", "event_type", "conflicting_positions"],
    }
    return {
        "type": "object", "additionalProperties": False,
        "properties": {
            "overview_claims": {"type": "array", "items": claim},
            "entries": {"type": "array", "items": entry},
        },
        "required": ["overview_claims", "entries"],
    }


def _claim_supported(claim: VerifiedClaim, evidence_by_id: Dict[str, EvidenceItem]) -> bool:
    if not claim.source_ids or any(s not in evidence_by_id for s in claim.source_ids):
        return False
    words = {w for w in re.findall(r"[a-z0-9]{4,}", claim.text.lower())}
    source_words = set()
    for sid in claim.source_ids:
        source_words.update(re.findall(r"[a-z0-9]{4,}", evidence_by_id[sid].excerpt.lower()))
    combined_sources = " ".join(evidence_by_id[sid].excerpt for sid in claim.source_ids).lower()
    # Numbers and quoted passages are the highest-risk hallucinations in this
    # domain; every one must occur verbatim in at least one cited excerpt.
    claim_numbers = [number.rstrip(".,") for number in re.findall(r"(?<![a-z])\d[\d,.%/-]*", claim.text.lower())]
    if any(number not in combined_sources for number in claim_numbers):
        return False
    quoted = re.findall(r"[\"“]([^\"”]{3,})[\"”]", claim.text)
    if any(value.lower().strip() not in combined_sources for value in quoted):
        return False
    # Entity/number-heavy claims need real overlap; prose can pass at a modest
    # threshold because the verifier receives short evidence excerpts.
    return not words or len(words & source_words) / max(1, len(words)) >= 0.12


def _generate_chronology_v2(
    *, project_id: str, project_name: str, topic: str, issue_number: int = 1,
    job_id: str = "",
    date_from: str = "", date_to: str = "", parties: Sequence[str] = (),
    source_doc_ids: Sequence[str] = (), preparation: Optional[Dict] = None,
    stage_callback: Optional[Callable[[str, float], None]] = None,
    load_step: Optional[Callable[[str, str], Dict | None]] = None,
    save_step: Optional[Callable[[str, str, str, Dict | None, str], None]] = None,
) -> Dict:
    """Generate a checkpointable chronology from a Markdown evidence pack."""
    from .chronology_prompts import chronology_prompt_hash
    from .chronology_v2 import (
        COVERAGE_FACETS, PIPELINE_VERSION, PreparedChronologyQuery, coverage_matrix,
        aggregate_candidates, evidence_from_documents, extract_batches,
        prepare_chronology_query, source_preview, synthesize, verify_claims, _enforce_event_date,
    )
    from .jargon_manager import jargon_dictionary_version

    def stage(name: str, progress: float) -> None:
        if stage_callback:
            stage_callback(name, progress)

    stage("research_plan", .08)
    if preparation and preparation.get("prepared"):
        raw = preparation["prepared"]
        prepared = PreparedChronologyQuery(
            original_query=str(raw.get("original_query") or topic),
            english_query=str(raw.get("english_query") or topic),
            jargon_matches=tuple(tuple(value) for value in raw.get("jargon_matches", [])),
            parties=tuple(raw.get("parties", parties)), contracts=tuple(raw.get("contracts", [])),
            work_packages=tuple(raw.get("work_packages", [])),
            exclusions=tuple(raw.get("exclusions", [])),
            research_queries=tuple(raw.get("research_queries", [])),
        )
    else:
        prepared = prepare_chronology_query(
            topic, date_from=date_from, date_to=date_to, parties=parties,
            project_id=project_id,
        )

    chosen = [str(value) for value in source_doc_ids if str(value).strip()]
    if not chosen:
        # source_preview used to run here purely to turn retrieval into a list
        # of doc_ids, which the pack builder then re-read from disk. The pack
        # builder now keeps the passages directly, so calling it would mean
        # paying for the same retrieval twice. It remains the API's preview
        # endpoint, where showing the analyst the candidate documents is the
        # whole point.
        stage("source_selection", .14)
    stage("evidence_pack", .2)
    selection_stats: Dict = {}
    event_discovery_audit: Dict = {}
    if source_doc_ids:
        # Read every selected passage across bounded extraction calls. A long
        # document must not lose its later pages to a total/per-file pack cap.
        picked = evidence_from_documents(project_id, chosen)
        selection = select_pack(
            picked, facets=COVERAGE_FACETS, max_chars=None, relevance_floor=0.0,
        )
        evidence = selection.evidence
        selection_stats = selection.stats
    else:
        # Otherwise keep all qualifying passages retrieval actually scored.
        # Individual extraction calls remain bounded by text. The previous path
        # threw the scored passages away, kept
        # only their doc_ids and re-read those fragments whole — which is how a
        # 240 MB corpus produced a 24,000-character pack.
        from .chronology_discovery import discover_chronology_evidence
        discovery = discover_chronology_evidence(
            project_id=project_id, prepared=prepared, date_from=date_from, date_to=date_to,
            fallback=lambda queries, doc_ids: retrieve_evidence(
                project_id, queries, doc_ids=doc_ids,
            ),
        )
        event_discovery_audit = discovery.audit
        selection = select_pack(discovery.evidence, facets=COVERAGE_FACETS, max_chars=None)
        evidence = selection.evidence
        selection_stats = selection.stats
        chosen = sorted({item.doc_id for item in evidence if item.doc_id})
    if not evidence:
        raise ValueError("no_evidence")

    # Provider calls are governed by credits, bounded research rounds and
    # request timeouts. Do not make completion depend on corpus/cache-specific
    # call counts.

    stage("evidence_extraction", .3)
    extraction_stats: Dict = {}
    candidates = extract_batches(
        evidence, prepared, load_step=load_step, save_step=save_step,
        job_scope=job_id or f"project:{project_id}", stats=extraction_stats,
    )
    if not candidates:
        raise ValueError("insufficient_evidence")
    stage("aggregation", .58)
    candidates = aggregate_candidates(
        prepared=prepared, candidates=candidates, evidence=evidence,
        load_step=load_step, save_step=save_step,
    )
    stage("synthesis", .68)
    response = synthesize(
        prepared=prepared, candidates=candidates, evidence=evidence,
        cache_context=(
            f"{job_id or project_id}:{chronology_prompt_hash()}:"
            f"{jargon_dictionary_version()}:"
            f"{hashlib.sha256(_evidence_payload(evidence).encode()).hexdigest()}"
        ),
        load_step=load_step, save_step=save_step,
    )
    verification_hash = hashlib.sha256(json.dumps(
        {"chronology": response, "policy": "claim-and-event-date-v1"}, sort_keys=True, ensure_ascii=False,
    ).encode()).hexdigest()
    stage("verification", .82)
    verification_step = load_step("verification", verification_hash) if load_step else None
    if verification_step and verification_step.get("status") == "ready":
        verification = dict((verification_step.get("output") or {}).get("decisions", {}))
    else:
        if save_step:
            save_step("verification", verification_hash, "processing", None, "")
        try:
            verification = verify_claims(
                prepared=prepared, chronology=response, evidence=evidence,
                cache_context=f"{job_id or project_id}:{verification_hash}",
                load_step=load_step, save_step=save_step,
            )
        except Exception:
            if save_step:
                save_step(
                    "verification", verification_hash, "failed", None,
                    "source_verification_failed",
                )
            raise
        if save_step:
            save_step(
                "verification", verification_hash, "ready",
                {"decisions": verification}, "",
            )
    by_id = {e.source_id: e for e in evidence}
    entries: List[ChronologyEntry] = []
    removed = 0
    overview_claims = []
    for claim_index, item in enumerate(response.get("overview_claims", [])):
        claim = VerifiedClaim(
            text=str(item.get("text") or "").strip(),
            source_ids=[str(x) for x in item.get("source_ids", [])],
            counter_source_ids=[str(x) for x in item.get("counter_source_ids", [])],
            is_inference=bool(item.get("is_inference")),
            inference_basis=str(item.get("inference_basis") or ""),
            confidence=str(item.get("confidence") or "low"),
        )
        claim.supported = (
            verification.get(f"overview:{claim_index}", False)
            and _claim_supported(claim, by_id)
        )
        if claim.supported:
            overview_claims.append(claim)
        else:
            removed += 1
    entries.append(ChronologyEntry(
        entry_ref=f"6.{issue_number}.1", event_date="", date_precision="unknown",
        claims=overview_claims, parties=[], event_type="overview",
        conflicting_positions=[],
    ))
    if not overview_claims:
        raise ValueError("source_verification_failed")
    ordered_raw = sorted(response.get("entries", []), key=lambda raw: (
        str(raw.get("event_date") or "9999-99-99"),
        " ".join(str(c.get("text") or "") for c in raw.get("claims", [])),
    ))
    original_event_indexes = {id(raw): index for index, raw in enumerate(response.get("entries", []))}
    for index, raw in enumerate(ordered_raw, 2):
        claims = []
        event_index = original_event_indexes[id(raw)]
        for claim_index, item in enumerate(raw.get("claims", [])):
            claim = VerifiedClaim(
                text=str(item.get("text") or "").strip(),
                source_ids=[str(x) for x in item.get("source_ids", [])],
                counter_source_ids=[str(x) for x in item.get("counter_source_ids", [])],
                is_inference=bool(item.get("is_inference")),
                inference_basis=str(item.get("inference_basis") or ""),
                confidence=str(item.get("confidence") or "low"),
            )
            claim.supported = (
                verification.get(f"event:{event_index}:{claim_index}", False)
                and _claim_supported(claim, by_id)
            )
            if claim.supported:
                claims.append(claim)
            else:
                removed += 1
        if raw.get("event_date") and not verification.get(f"date:{event_index}", False):
            raw = {**raw, "event_date": "", "date_precision": "unknown",
                   "date_source": "unresolved", "date_evidence": ""}
        if raw.get("date_precision") == "inferred" and claims:
            claims[0].is_inference = True
            if not claims[0].inference_basis:
                claims[0].inference_basis = ("The event date is not established by the cited record"
                    if not raw.get("event_date") else "The cited record establishes only an approximate event date")
        if not claims:
            continue
        raw = _enforce_event_date({**raw, "claims": [asdict(c) for c in claims]}, evidence)
        entries.append(ChronologyEntry(
            entry_ref=f"6.{issue_number}.{index}", event_date=str(raw.get("event_date") or ""),
            date_precision=str(raw.get("date_precision") or "unknown"), claims=claims,
            date_source=str(raw.get("date_source") or "unresolved"),
            date_evidence=str(raw.get("date_evidence") or ""),
            parties=[str(x) for x in raw.get("parties", [])],
            event_type=str(raw.get("event_type") or "event"),
            conflicting_positions=[str(x) for x in raw.get("conflicting_positions", [])],
        ))
    if len(entries) < 2:
        raise ValueError("insufficient_evidence")
    entries[1:] = sorted(entries[1:], key=lambda entry: entry.event_date or "9999-99-99")
    for index, entry in enumerate(entries, 1):
        entry.entry_ref = f"6.{issue_number}.{index}"
    stage("word", .9)
    blob, audit = build_ai_chronology_docx(
        project_name=project_name, issue_number=issue_number, title=topic,
        entries=entries, evidence=evidence, audit_metadata=None,
    )
    if audit.unresolved_source_ids:
        raise ValueError("Report contains unresolved source references")

    # Coverage of the pack that was actually read, not of everything retrieval
    # happened to surface. `preview` measures the pre-selection superset, so a
    # facet covered only by a document that was never selected still counted as
    # covered — which is how a three-entry report came back "complete".
    pack_coverage = coverage_matrix(evidence)
    assessment = assess_pack(
        evidence=evidence,
        event_count=len(entries) - 1,       # entries[0] is the synthetic overview
        coverage=pack_coverage,
        extraction_stats=extraction_stats,
    )
    assessment.pack["selection"] = selection_stats

    discovery_reasons = list(event_discovery_audit.get("partial_reasons", []))
    final_reasons = list(dict.fromkeys([*assessment.reasons, *discovery_reasons]))
    return {
        "entries": [asdict(e) for e in entries],
        "evidence": [asdict(e) for e in evidence],
        "research_questions": list(prepared.research_queries),
        "removed_claims": removed, "audit": {
            **asdict(audit), "candidate_clusters": len(candidates),
            "synthesized_events": len(response.get("entries", [])),
            "verifier_removed_events": len(response.get("entries", [])) - (len(entries) - 1),
            "issued_events": len(entries) - 1,
        }, "docx": blob, "research_audit": {"event_discovery": event_discovery_audit},
        "model": _model_for_task("report_structured"), "pipeline_version": PIPELINE_VERSION,
        "prompt_version": PROMPT_VERSION,
        "coverage": pack_coverage,
        "coverage_status": "partial" if final_reasons else "complete",
        "partial_reasons": final_reasons,
        "selected_doc_ids": chosen,
        # What the model was actually given. None of this was recorded before,
        # which is why a thin report could not be told from a broken one.
        "pack": assessment.pack,
    }


def generate_chronology(**kwargs) -> Dict:
    """Run the job-pinned chronology pipeline inside an isolated call budget."""
    from .llm_client import begin_chronology_call_budget, end_chronology_call_budget
    begin_chronology_call_budget()
    try:
        pipeline_version = str(kwargs.pop("pipeline_version", "chronology-v2") or "chronology-v2")
        if pipeline_version == "chronology-v3":
            from .chronology_v3 import generate_chronology_v3
            return generate_chronology_v3(**kwargs)
        return _generate_chronology_v2(**kwargs)
    finally:
        end_chronology_call_budget()


def _forensic_schema() -> Dict:
    claim = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "text": {"type": "string"},
            "source_ids": {"type": "array", "items": {"type": "string"}},
            "counter_source_ids": {"type": "array", "items": {"type": "string"}},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
            "missing_records": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["text", "source_ids", "counter_source_ids", "confidence", "missing_records"],
    }
    section = {
        "type": "object", "additionalProperties": False,
        "properties": {"name": {"type": "string", "enum": list(FORENSIC_SECTIONS)},
                       "claims": {"type": "array", "items": claim}},
        "required": ["name", "claims"],
    }
    return {"type": "object", "additionalProperties": False,
            "properties": {"sections": {"type": "array", "items": section}},
            "required": ["sections"]}


def generate_forensic(
    *, project_id: str, project_name: str, topic: str,
    date_from: str = "", date_to: str = "", parties: Sequence[str] = (),
    toolkit_evidence: Sequence[EvidenceItem] = (), status: str = "Draft",
    toolkit_artifact_ids: Sequence[str] = (),
) -> Dict:
    from .config import OPENAI_MODEL
    from .llm_client import generate_response_json
    from .jargon_manager import prepare_query, set_current_prepared_query
    prepared = prepare_query(topic)
    set_current_prepared_query(prepared)
    questions = build_research_plan(topic, date_from, date_to, parties)
    artifact_evidence: List[EvidenceItem] = []
    if toolkit_artifact_ids:
        from .toolkit_evidence_store import get_toolkit_evidence_store
        artifact_evidence = get_toolkit_evidence_store().as_evidence(
            list(toolkit_artifact_ids), project_id,
        )
    evidence = retrieve_evidence(project_id, questions) + list(toolkit_evidence) + artifact_evidence
    canonical_claims: List[VerifiedClaim] = []
    # Reuse an already verified chronology for the same project/topic. This is
    # what prevents the two existing modules from issuing different dates or
    # citations for the same event, while avoiding another model call.
    try:
        from backend.tasks.report_jobs import get_report_job_store
        previous = next((job for job in get_report_job_store().list_project(
            project_id, module="chronology"
        ) if job.get("status") == "ready" and
            str(job.get("title") or "").casefold() == topic.casefold() and
            job.get("result")), None)
        if previous:
            old_evidence = [EvidenceItem(**item) for item in previous["result"].get("evidence", [])]
            merged = {item.source_id: item for item in [*evidence, *old_evidence]}
            evidence = list(merged.values())
            for entry in previous["result"].get("entries", []):
                for raw_claim in entry.get("claims", []):
                    claim = VerifiedClaim(**raw_claim)
                    if claim.supported:
                        canonical_claims.append(claim)
    except Exception:
        canonical_claims = []
    if not evidence:
        raise ValueError("No project evidence was found for this report topic")
    # Read all retrieved evidence in bounded calls; merge verified section
    # claims deterministically instead of stuffing the full pack into one call.
    batches: List[List[EvidenceItem]] = []
    current: List[EvidenceItem] = []
    size = 2
    for original in evidence:
        # Keep the original source identity/locator for footnotes. Large source
        # excerpts are read in overlapping windows, never clipped or discarded.
        pieces = [original]
        if len(_evidence_payload(pieces)) > 70_000:
            pieces = [replace(original, excerpt=original.excerpt[offset:offset + 6000])
                      for offset in range(0, len(original.excerpt), 5800)]
        for item in pieces:
            item_size = len(_evidence_payload([item])) + 2
            if item_size > 80_000:
                raise ValueError("forensic_evidence_metadata_exceeds_batch_budget")
            if current and size + item_size > 80_000:
                batches.append(current); current = []; size = 2
            current.append(item); size += item_size
    if current:
        batches.append(current)

    def read_batch(evidence):
        prompt = (
            f"Prepare a {status} forensic report about: {topic}\n"
            "Use all nine required section names exactly. Do not calculate delay duration, "
            "critical path, concurrency or entitlement unless a toolkit evidence object supplies it.\n\n"
            f"{prepared.context}\n\nEVIDENCE JSON:\n{_evidence_payload(evidence)}"
        )
        return generate_response_json(
            prompt, system=_SYSTEM, schema=_forensic_schema(), schema_name="forensic_report",
            model=OPENAI_MODEL, reasoning_effort="high", pro_mode=(status.lower() == "issue"),
            cache_key="forensic-report:" + hashlib.sha256(prompt.encode()).hexdigest()[:28],
        )

    with ThreadPoolExecutor(max_workers=min(3, len(batches))) as pool:
        futures = [pool.submit(copy_context().run, read_batch, batch) for batch in batches]
        responses = [future.result() for future in futures]
    response = responses[0]
    by_id = {e.source_id: e for e in evidence}
    sections: Dict[str, List[VerifiedClaim]] = {name: [] for name in FORENSIC_SECTIONS}
    removed = 0
    seen_claims = {name: set() for name in FORENSIC_SECTIONS}
    for section in (section for result in responses for section in result.raw.get("sections", [])):
        name = str(section.get("name") or "")
        if name not in sections:
            continue
        for raw in section.get("claims", []):
            claim = VerifiedClaim(
                text=str(raw.get("text") or ""),
                source_ids=[str(x) for x in raw.get("source_ids", [])],
                counter_source_ids=[str(x) for x in raw.get("counter_source_ids", [])],
                confidence=str(raw.get("confidence") or "low"),
                missing_records=[str(x) for x in raw.get("missing_records", [])],
            )
            claim.supported = _claim_supported(claim, by_id)
            if claim.supported:
                identity = (claim.text, tuple(claim.source_ids), tuple(claim.counter_source_ids))
                if identity not in seen_claims[name]:
                    sections[name].append(claim)
                    seen_claims[name].add(identity)
            else:
                removed += 1
    if canonical_claims:
        sections["Factual chronology"] = canonical_claims
    blob, audit = build_forensic_report_docx(
        project_name=project_name, title=topic, sections=sections, evidence=evidence,
        status=status, audit_metadata={"prompt": FORENSIC_PROMPT_VERSION,
                                       "model": response.usage.model,
                                       "policy": MODEL_POLICY},
    )
    missing_sections = [name for name in FORENSIC_SECTIONS if not sections.get(name)]
    if status.lower() == "issue" and (
        audit.unresolved_source_ids or removed or missing_sections or audit.footnote_records == 0
    ):
        raise ValueError("Issue report failed mandatory evidence verification")
    return {"sections": {k: [asdict(c) for c in v] for k, v in sections.items()},
            "evidence": [asdict(e) for e in evidence], "research_questions": questions,
            "removed_claims": removed, "audit": asdict(audit), "docx": blob,
            "model": response.usage.model, "evidence_batches": len(batches)}


__all__ = [
    "MODEL_POLICY", "PROMPT_VERSION", "build_research_plan", "generate_chronology",
    "generate_forensic", "retrieve_evidence",
]

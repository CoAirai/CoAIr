"""Master-event-first discovery shared by Chronology V2 and V3."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Sequence

from .config import CHRONOLOGY_EVENT_DISCOVERY_MODE
from .evidence_model import EvidenceItem


@dataclass(frozen=True)
class ChronologyDiscoveryResult:
    evidence: List[EvidenceItem] = field(default_factory=list)
    master_evidence: List[EvidenceItem] = field(default_factory=list)
    fallback_evidence: List[EvidenceItem] = field(default_factory=list)
    selected_doc_ids: List[str] = field(default_factory=list)
    audit: Dict = field(default_factory=dict)


def _requested_event_groups(query: str) -> Dict[str, Sequence[str]]:
    text = query.casefold()
    groups = {
        ("delay", "disruption"): ("delay", "late", "prolong", "disrupt"),
        ("notice", "correspondence"): ("notice", "notification", "correspondence", "letter"),
        ("instruction", "direction"): ("instruction", "direction", "directed"),
        ("variation", "change"): ("variation", "change", "scope"),
        ("programme_update", "data_date"): ("programme", "schedule", "baseline", "data date"),
        ("extension_of_time", "claim"): ("claim", "extension of time", "eot", "entitlement"),
        ("payment", "certificate"): ("payment", "certificate", "valuation"),
        ("meeting", "decision", "agreement"): ("decision", "meeting", "agreed"),
        ("dispute", "adjudication"): ("dispute", "adjudication", "arbitration"),
        ("party_position", "response"): ("position", "asserted", "contended", "denied"),
    }
    result: Dict[str, Sequence[str]] = {}
    for event_types, terms in groups.items():
        if any(term in text for term in terms):
            result["/".join(event_types)] = event_types
    return result


def _event_types(query: str) -> List[str]:
    return list(dict.fromkeys(
        event_type for values in _requested_event_groups(query).values() for event_type in values
    ))


def _as_evidence(row: Dict) -> EvidenceItem:
    locator = row.get("source_locator") or {}
    kind = str(row.get("source_kind") or "document")
    page = locator.get("page")
    source_id = "evt_" + str(row["observation_id"])
    return EvidenceItem(
        source_id=source_id, doc_id=str(row.get("doc_id") or ""),
        file_name=str(row.get("file_name") or ""), title=str(row.get("file_name") or ""),
        page=int(page) if page else None,
        kind="excel" if kind == "data" else kind,
        sheet=str(locator.get("sheet") or ""),
        row_from=locator.get("row_from"), row_to=locator.get("row_to"),
        excerpt="\n".join(dict.fromkeys(filter(None, (
            str(row.get("date_evidence") or "").strip(),
            str(row.get("claim_quote") or "").strip(),
        ))))[:1200], score=float(row.get("score") or 0),
    )


def _focused_document_scope(project_id: str, prepared, queries: Sequence[str]) -> List[str]:
    """Resolve a bounded fallback scope without depending on event storage."""
    try:
        from .document_index import get_document_index
        return [item.doc_id for item in get_document_index().search(
            project_id=project_id, topic=prepared.english_query,
            queries=queries, parties=prepared.parties, limit=20,
        )]
    except Exception:
        return []


def discover_chronology_evidence(
    *, project_id: str, prepared, date_from: str = "", date_to: str = "",
    fallback: Callable[[Sequence[str], Sequence[str]], List[EvidenceItem]] | None = None,
) -> ChronologyDiscoveryResult:
    """Return master evidence and only the focused fallback needed for coverage."""
    mode = CHRONOLOGY_EVENT_DISCOVERY_MODE
    if mode not in {"off", "audit", "primary_fallback"}:
        mode = "off"
    query = "\n".join([prepared.english_query, *prepared.research_queries,
                       *prepared.parties, *prepared.work_packages])
    if mode == "off":
        evidence = fallback(prepared.research_queries, ()) if fallback else []
        return ChronologyDiscoveryResult(
            evidence=evidence, fallback_evidence=evidence,
            selected_doc_ids=sorted({item.doc_id for item in evidence if item.doc_id}),
            audit={"mode": "off", "master_hits": 0, "fallback_hits": len(evidence),
                   "partial_reasons": ["event_discovery_disabled"]},
        )

    from .master_event_store import get_master_event_store
    try:
        store = get_master_event_store()
        status = store.project_status(project_id)
    except Exception:
        queries = list(prepared.research_queries[:4]) or [prepared.english_query]
        scope = _focused_document_scope(project_id, prepared, queries)
        evidence = fallback(queries, scope) if fallback else []
        return ChronologyDiscoveryResult(
            evidence=evidence, fallback_evidence=evidence,
            selected_doc_ids=sorted({item.doc_id for item in evidence if item.doc_id}),
            audit={
                "mode": mode, "master_hits": 0, "fallback_hits": len(evidence),
                "master_status": {}, "master_coverage": {}, "missing_facets": [],
                "incomplete_doc_ids": [],
                "partial_reasons": ["master_event_store_unavailable"],
                "search_degradations": ["master_event_store_unavailable"],
                "dense_event_index_used": False, "counter_observation_hits": 0,
                "event_index_gap_doc_ids": [],
            },
        )
    dense_scores: Dict[str, float] = {}
    search_degradations: List[str] = []
    if int(status.get("observation_count") or 0) > 0:
        try:
            from .event_vector_index import get_event_vector_index
            dense_scores = get_event_vector_index().search(
                project_id=project_id, query=prepared.english_query, limit=400,
            )
        except Exception:
            search_degradations.append("event_vector_search_unavailable")
    requested_groups = _requested_event_groups(query)
    requested_types = _event_types(query)
    rows = store.search_observations(
        project_id=project_id, query=query, date_from=date_from, date_to=date_to,
        parties=prepared.parties, event_types=requested_types, limit=400,
    )
    lexical_ids = [str(row["observation_id"]) for row in rows]
    if dense_scores:
        known = {str(row["observation_id"]) for row in rows}
        dense_rows = store.observations_by_ids(
            project_id=project_id,
            observation_ids=[key for key in dense_scores if key not in known],
        )
        for row in dense_rows:
            event_type = str(row.get("event_type") or "")
            normalized_date = str(row.get("normalized_date") or "")
            if requested_types and event_type not in requested_types:
                continue
            if normalized_date and date_from and normalized_date < date_from:
                continue
            if normalized_date and date_to and normalized_date > date_to:
                continue
            rows.append(row)
    # Counter-party/contrary positions are a distinct lane. They remain their
    # own observations and are never attached as direct support by discovery.
    counter_candidate_ids: set[str] = set()
    if rows and prepared.parties:
        counter_rows = store.search_observations(
            project_id=project_id,
            query=(f"{prepared.english_query} denied disputed rejected contrary response"),
            date_from=date_from, date_to=date_to, parties=prepared.parties,
            event_types=(), limit=120,
        )
        known = {str(row["observation_id"]) for row in rows}
        for row in counter_rows:
            counter_blob = " ".join(str(row.get(field) or "").casefold() for field in (
                "party_position", "action_text", "claim_quote", "event_type",
            ))
            if (str(row.get("event_type") or "") in {"party_position", "response"}
                    or any(term in counter_blob for term in (
                        "denied", "disputed", "rejected", "contrary", "response", "rebuttal",
                    ))):
                counter_candidate_ids.add(str(row["observation_id"]))
            if str(row["observation_id"]) not in known:
                rows.append(row); known.add(str(row["observation_id"]))
    # Rank fusion over independent lexical/structured and dense lanes.
    lexical_rank = {observation_id: index for index, observation_id in enumerate(lexical_ids, 1)}
    dense_rank = {key: index for index, (key, _) in enumerate(
        sorted(dense_scores.items(), key=lambda item: -item[1]), 1)}
    for row in rows:
        oid = str(row["observation_id"])
        row["score"] = (
            (1.0 / (60 + lexical_rank[oid]) if oid in lexical_rank else 0.0)
            + (1.0 / (60 + dense_rank[oid]) if oid in dense_rank else 0.0)
        )
    master = [_as_evidence(row) for row in sorted(rows, key=lambda item: -item["score"])]
    # Stable observation IDs may not be registry doc IDs, so preserve the source
    # document ID explicitly for targeted fallback and deletion scopes.
    master_doc_ids = sorted({str(row.get("doc_id") or "") for row in rows if row.get("doc_id")})

    # Coverage is query-scoped. Requiring every generic report facet here would
    # trigger a broad corpus pass even for a complete, narrowly requested event
    # type and defeat the master-first architecture.
    coverage = {
        label: sum(1 for row in rows if row.get("event_type") in event_types)
        for label, event_types in requested_groups.items()
    }
    if not requested_types:
        coverage = {"requested_topic": len(master)}
    missing = [name for name, hits in coverage.items() if hits == 0]
    incomplete = store.incomplete_documents(project_id)
    reasons = list(status.get("partial_reasons", []))
    if missing:
        reasons.append("master_event_coverage_gap")
    if not master:
        reasons.append("master_event_no_hits")
    if prepared.parties and not counter_candidate_ids:
        reasons.append("master_counter_evidence_gap")
    needs_fallback = bool(reasons)
    fallback_evidence: List[EvidenceItem] = []
    reindex_gap_doc_ids: List[str] = []
    if fallback and (mode == "audit" or needs_fallback):
        queries = [f"{prepared.english_query} {name.replace('_', ' ')} evidence" for name in missing]
        if "master_counter_evidence_gap" in reasons:
            queries.append(
                f"{prepared.english_query} {' '.join(prepared.parties)} response denied disputed rebuttal"
            )
        if not queries:
            queries = list(prepared.research_queries[:4])
        # Incomplete documents are the first scope. If every active document was
        # indexed, corroboration is focused on documents already behind event hits.
        scope = incomplete or master_doc_ids
        if "master_counter_evidence_gap" in reasons and not incomplete:
            try:
                scope = list(dict.fromkeys([
                    *scope, *_focused_document_scope(project_id, prepared, queries),
                ]))
            except Exception:
                pass
        fallback_evidence = fallback(queries, scope)
        if mode == "primary_fallback":
            newly_discovered_docs = sorted({
                item.doc_id for item in fallback_evidence
                if item.doc_id and item.doc_id not in master_doc_ids
            })
            if newly_discovered_docs:
                reindex_gap_doc_ids = store.enqueue_gap_reindex(
                    project_id, newly_discovered_docs,
                )
        if fallback_evidence:
            reasons = [reason for reason in reasons if reason != "master_event_coverage_gap"]
    if mode == "audit":
        evidence = fallback_evidence
    else:
        merged = {item.source_id: item for item in [*master, *fallback_evidence]}
        evidence = sorted(merged.values(), key=lambda item: -float(item.score or 0))
    return ChronologyDiscoveryResult(
        evidence=evidence, master_evidence=master, fallback_evidence=fallback_evidence,
        selected_doc_ids=sorted({item.doc_id for item in evidence if item.doc_id}),
        audit={
            "mode": mode, "master_hits": len(master), "fallback_hits": len(fallback_evidence),
            "master_status": status, "master_coverage": coverage,
            "missing_facets": missing, "incomplete_doc_ids": incomplete,
            "partial_reasons": list(dict.fromkeys(reasons)),
            "dense_event_index_used": bool(dense_scores),
            "counter_observation_hits": len(counter_candidate_ids),
            "search_degradations": search_degradations,
            "event_index_gap_doc_ids": reindex_gap_doc_ids,
        },
    )


__all__ = ["ChronologyDiscoveryResult", "discover_chronology_evidence"]

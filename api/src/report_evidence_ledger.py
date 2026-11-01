"""Source-only coverage accounting and one targeted repair round.

A covered keyword facet is a discovery signal, never proof that a corpus has
been read exhaustively. Raw excerpts stay in the evidence store, not this log.
"""
from __future__ import annotations

from collections import defaultdict
from hashlib import sha256


def repair_chronology_evidence(evidence, prepared, *, project_id, retrieve, audit):
    from .chronology_v2 import COVERAGE_FACETS, coverage_matrix
    from .evidence_pack import select_pack
    before=coverage_matrix(evidence)
    missing=[facet for facet,hits in before.items() if not hits]
    audit.update({'coverage_before':before,'missing_before':missing,'repair_queries':[],
                  'new_passages':0})
    if not missing:
        audit['coverage_after']=before
        return evidence
    queries=[f'{prepared.english_query} — {facet.replace("_"," ")}: '
             + ', '.join(COVERAGE_FACETS[facet][:3]) for facet in missing]
    audit['repair_queries']=queries
    found=retrieve(project_id,queries)
    merged={item.source_id:item for item in evidence}
    for item in found:
        current=merged.get(item.source_id)
        if current is None or item.score > current.score:
            merged[item.source_id]=item
    audit['new_passages']=len(merged)-len({item.source_id for item in evidence})
    selected=select_pack(list(merged.values()),facets=COVERAGE_FACETS,max_chars=None).evidence
    audit['coverage_after']=coverage_matrix(selected)
    audit['missing_after']=[facet for facet,hits in audit['coverage_after'].items() if not hits]
    return selected


def evidence_ledger(evidence, *, scope, retrieval_rounds=(), repair=None):
    documents=defaultdict(lambda:{'pages':set(),'source_ids':[],'characters':0})
    for item in evidence:
        row=documents[(item.doc_id,item.file_name)]
        if item.page:
            row['pages'].add(item.page)
        row['source_ids'].append(item.source_id)
        row['characters']+=len(item.excerpt)
    reasons=[]
    if any(r.get('lane_errors') for r in retrieval_rounds):
        reasons.append('retrieval_lane_failed')
    if any(r.get('unhydrated_previews') or r.get('mirror_read_failed') for r in retrieval_rounds):
        reasons.append('source_text_incomplete')
    if any(r.get('unresolved_locators') for r in retrieval_rounds):
        reasons.append('source_locator_incomplete')
    if any(r.get('unresolved_owners') for r in retrieval_rounds):
        reasons.append('source_ownership_unresolved')
    return {
        'policy':'source-coverage-v1','scope':scope,
        'exhaustive_corpus_read':False,
        'evidence_sha256':sha256('\n'.join(sorted(item.source_id for item in evidence)).encode()).hexdigest(),
        'documents':[{'doc_id':doc_id,'file_name':name,'pages':sorted(row['pages']),
                      'source_ids':sorted(set(row['source_ids'])),'characters':row['characters']}
                     for (doc_id,name),row in sorted(documents.items())],
        'retrieval_rounds':list(retrieval_rounds),'coverage_repair':repair or {},
        'partial_reasons':reasons,
    }

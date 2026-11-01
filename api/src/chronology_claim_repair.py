"""One source-local repair pass after semantic verification, without new research."""
from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import asdict
from typing import List

from pydantic import BaseModel, Field, ValidationError

from .chronology_v2 import (
    ClaimModel, _claims_are_source_valid, _date_matches_quote, _hash,
    _is_structured_output_error, _synthesis_batches, evidence_markdown,
)
from .chronology_prompts import chronology_prompt_hash, load_chronology_prompts


REPAIR_INSTRUCTIONS = (
    'Repair only these rejected event claims from their OWN cited evidence. '
    'Return exactly one item per cluster_id as claim_ref. Return replacement=null if the source '
    'does not support a truthful replacement. Do not add sources or new observations. '
    'Keep planned, required, proposed and scheduled acts explicitly prospective: '
    'a requirement to execute an agreement is not proof it was executed. '
    'Separate the scheduled act from undated background; do not invent its date. '
    'Remove unsupported specificity instead of inventing support. Every replacement '
    'must retain the actual supported action and one to three of its original source IDs.\n\n'
)


class RepairItem(BaseModel):
    claim_ref: str
    replacement: ClaimModel | None = None


class RepairModel(BaseModel):
    items: List[RepairItem] = Field(default_factory=list)


def repair_rejected_claims(*, chronology, verification, evidence, prepared,
                           cache_context, load_step=None, save_step=None, on_repair=None):
    from . import chronology_v2, llm_client
    from .jargon_manager import jargon_dictionary_version
    result = deepcopy(chronology)
    decisions = dict(verification)
    stats = {'attempted': 0, 'accepted': 0, 'dates_verified': 0, 'unresolved': 0}
    pending = []
    locations = {}
    date_requests = set()
    for event_index, event in enumerate(result.get('entries', [])):
        for claim_index, claim in enumerate(event.get('claims', [])):
            ref = f'event:{event_index}:{claim_index}'
            dated_ref = f'date:{event_index}:{claim_index}'
            date_rejected = (event.get('event_date') and not decisions.get(
                dated_ref, decisions.get(f'date:{event_index}', False))
                and _date_matches_quote(event['event_date'], event.get('date_precision', ''), claim['text']))
            if decisions.get(ref, False) and not date_rejected:
                continue
            # Invented citations/numbers must not be used to widen repair scope.
            if not _claims_are_source_valid({'entries': [{'claims': [claim]}]}, evidence):
                continue
            locations[ref] = (event_index, claim_index, claim)
            if date_rejected:
                date_requests.add(ref)
            pending.append({**event, 'cluster_id': ref, 'claims': [claim]})
    if not pending:
        return result, decisions, stats
    if on_repair:
        on_repair()
    stats['attempted'] = len(pending)
    prompts = load_chronology_prompts()
    pending_ids = {sid for item in pending for claim in item['claims']
                   for sid in [*claim.get('source_ids', []), *claim.get('counter_source_ids', [])]}
    repair_evidence = [e for e in evidence if e.source_id in pending_ids]
    input_hash = _hash({'chronology': chronology, 'pending': pending, 'decisions': decisions,
        'evidence': [asdict(e) for e in repair_evidence], 'policy': 'source-local-claim-repair-v1',
        'prompt': chronology_prompt_hash(), 'repair_instructions': REPAIR_INSTRUCTIONS,
        'schema': RepairModel.model_json_schema(),
        'jargon': jargon_dictionary_version(),
        'models': [llm_client._model_for_task(t) for t in ('chronology_extract', 'chronology_verify')]})
    previous = load_step('claim_repair', input_hash) if load_step else None
    if previous and previous.get('status') == 'ready':
        saved = previous.get('output') or {}
        cached = saved.get('chronology')
        if cached and _claims_are_source_valid(cached, evidence):
            return cached, saved['verification'], saved['stats']
    if save_step:
        save_step('claim_repair', input_hash, 'processing', None, '')
    touched = set()
    remaining_refs = set(locations)
    # Only rejected claims and their own sources are sent. Small independent
    # batches bound context; no retrieval, graph walk or research planner runs.
    for batch_number, batch in enumerate(_synthesis_batches(pending, repair_evidence, max_chars=12_000), 1):
        refs = {item['cluster_id'] for item in batch}
        source_ids = {sid for item in batch for c in item['claims']
                      for sid in [*c.get('source_ids', []), *c.get('counter_source_ids', [])]}
        cited = [e for e in repair_evidence if e.source_id in source_ids]
        prompt = (
            f'TOPIC: {prepared.english_query}\n'
            f'{REPAIR_INSTRUCTIONS}'
            f'REJECTED CLAIMS:\n{json.dumps(batch, ensure_ascii=False)}\n\n'
            f'EVIDENCE BEGIN\n{evidence_markdown(cited)}\nEVIDENCE END'
        )
        try:
            generated = llm_client.generate_response_json(prompt, system=prompts['system'],
                schema=RepairModel.model_json_schema(), schema_name='chronology_claim_repair',
                task_type='chronology_extract', validation_model=RepairModel,
                thinking_level='low', max_tokens=16_384, prompt_version=prompts['version'],
                cache_key='chronology-claim-repair', cache_context=f'{cache_context}:{input_hash}:{batch_number}', ttl_s=0)
            items = RepairModel.model_validate(generated.raw).model_dump()['items']
            if len(items) != len(refs) or {v['claim_ref'] for v in items} != refs:
                raise ValueError('model_output_invalid')
        except Exception as exc:
            if not (_is_structured_output_error(exc) or isinstance(exc, ValidationError)
                    or (isinstance(exc, ValueError) and str(exc) == 'model_output_invalid')):
                raise
            continue
        proposals = []
        for item in items:
            claim = item['replacement']
            original = locations[item['claim_ref']][2]
            if claim is None or not set(claim['source_ids']) <= set(original['source_ids']):
                continue
            if not set(claim.get('counter_source_ids', [])) <= set(original.get('counter_source_ids', [])):
                continue
            if _claims_are_source_valid({'entries': [{'claims': [claim]}]}, cited):
                original_event = next(e for e in batch if e['cluster_id'] == item['claim_ref'])
                proposals.append({**original_event, 'claims': [claim]})
        if not proposals:
            continue
        try:
            checked = chronology_v2.verify_claims(prepared=prepared,
                chronology={'overview_claims': [], 'entries': proposals}, evidence=cited,
                cache_context=f'{cache_context}:repair-verification:{input_hash}:{batch_number}')
        except Exception as exc:
            if not (_is_structured_output_error(exc) or isinstance(exc, ValidationError)
                    or (isinstance(exc, ValueError) and str(exc) in {'model_output_invalid', 'source_verification_failed'})):
                raise
            continue
        for index, event in enumerate(proposals):
            ref = event['cluster_id']
            if not checked.get(f'event:{index}:0', False):
                continue
            event_index, claim_index, _ = locations[ref]
            result['entries'][event_index]['claims'][claim_index] = event['claims'][0]
            decisions[ref] = True
            decisions[f'date:{event_index}:{claim_index}'] = checked.get(f'date:{index}', False)
            touched.add(event_index)
            stats['accepted'] += 1
            stats['dates_verified'] += bool(checked.get(f'date:{index}', False))
            if ref not in date_requests or checked.get(f'date:{index}', False):
                remaining_refs.discard(ref)
    for event_index in touched:
        supported = [i for i in range(len(result['entries'][event_index]['claims']))
                     if decisions.get(f'event:{event_index}:{i}', False)]
        # The old paragraph decision applies to the old wording. Repaired
        # claims each received a new independent temporal decision.
        decisions[f'date:{event_index}'] = bool(supported) and all(
            decisions.get(f'date:{event_index}:{i}', False) for i in supported)
    stats['unresolved'] = len(remaining_refs)
    if save_step:
        save_step('claim_repair', input_hash, 'ready',
                  {'chronology': result, 'verification': decisions, 'stats': stats}, '')
    return result, decisions, stats

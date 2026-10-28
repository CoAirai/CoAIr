"""Fresh post-retrieval RAG/Coair comparison using one fixed private evidence pack.

Requires a disposable account store and an explicitly supplied reference file.
This does not certify retrieval over the full production corpus. Cached model
responses are disabled. Source documents and private report text stay on server.
"""
import argparse
import sys
sys.path.insert(0, "/app")
from dataclasses import fields
import hashlib
import json
from pathlib import Path
import time
from types import SimpleNamespace
from unittest.mock import patch


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--label', required=True)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not Path('/app/storage/.quality-qualification').is_file():
        raise SystemExit('A disposable store marker is required')
    from backend.core.security import current_user_var, UserContext
    from src.user_store import get_user_store
    from src.project_context import set_current_project
    from src.run_store import get_run_store
    from src.evidence_model import EvidenceItem
    from src.ai_reports import generate_chronology
    from src.config import GEMINI_MODEL
    golden = json.loads(args.reference.read_text())[0]
    raw = golden['result']; request = golden['request']
    user = get_user_store().get_user('demo@coair-test.local')
    assert user
    current_user_var.set(UserContext(username=user['username'], role=user['role'],
        display_name='Private quality qualification', features=user.get('features') or {},
        token_limit=user['token_limit']))
    set_current_project(golden['project_id'], 'owner')
    rid = get_run_store().start(project_id=golden['project_id'],username=user['username'],
                                module='chronology',query='Private frozen-evidence quality acceptance')
    allowed = {f.name for f in fields(EvidenceItem)}
    evidence = [EvidenceItem(**{k:v for k,v in item.items() if k in allowed}) for item in raw['evidence']]
    stages=[]; started=time.monotonic()
    with patch('src.chronology_v2.evidence_from_documents', return_value=evidence), \
         patch('src.ai_reports.select_pack',return_value=SimpleNamespace(evidence=evidence,stats={'mode':'same-frozen-evidence'})):
        out=generate_chronology(project_id=golden['project_id'],project_name=request['project_name'],
            topic=request['topic'],source_doc_ids=raw['selected_doc_ids'],
            preparation={'prepared':{'english_query':request['topic'],'research_queries':raw['research_questions']}},
            stage_callback=lambda s,p:stages.append({'stage':s,'seconds':round(time.monotonic()-started,2)}))
    Path(args.output).with_suffix('.docx').write_bytes(out.pop('docx'))
    private_result=Path(args.output).with_suffix('.report.json')
    private_result.write_text(json.dumps(out,indent=2))
    known={e.source_id for e in evidence}
    assert all(set(c['source_ids']) <= known for e in out['entries'] for c in e['claims'])
    assert not out['audit']['unresolved_source_ids']
    def ids(e):return {s for c in e['claims'] for s in c['source_ids']}
    baseline=[e for e in raw['entries'] if e['event_type']!='overview']
    generated=[e for e in out['entries'] if e['event_type']!='overview']
    matches=[any(e['event_date']==g['event_date'] and bool(ids(e)&ids(g)) for g in generated) for e in baseline]
    result={'label':args.label,'scope':'fresh post-retrieval generation, same fixed evidence pack',
        'model':GEMINI_MODEL,'seconds':round(time.monotonic()-started,2),
        'reference_entries':len(raw['entries']),'generated_entries':len(out['entries']),
        'reference_date_source_pairs_matched':sum(matches),'reference_event_count':len(baseline),
        'all_source_ids_valid':True,'unresolved_footnotes':0,'audit':out['audit'],
        'partial_reasons':out['partial_reasons'],'stages':stages,'run_id':rid,
        'evidence_passages':len(evidence),'evidence_hash':hashlib.sha256(json.dumps(raw['evidence'],sort_keys=True).encode()).hexdigest()}
    args.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)


if __name__=='__main__':main()

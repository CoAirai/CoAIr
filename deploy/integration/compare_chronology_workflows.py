"""Private full-corpus chronology comparison in disposable native-engine stores.

Does not patch planning, retrieval, evidence selection or model responses.
Qdrant mutations are blocked; production source files are read-only mounts.
"""
import argparse
import hashlib
import io
import json
import sys
import time
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, '/app')
CASES = [
    {'id': 'mudfa', 'topic': 'Utility diversion works under MUDFA: contractual scope, mobilisation, recorded diversion difficulties and programme consequences', 'date_from': '', 'date_to': ''},
    {'id': 'gogar', 'topic': 'Gogar depot', 'date_from': '2008-07-01', 'date_to': '2008-12-31'},
    {'id': 'utilities', 'topic': 'Utilities diversion programme: Parsons Brinckerhoff responsibilities, coordination decisions, recorded difficulties and programme consequences', 'date_from': '', 'date_to': ''},
]


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--label', required=True)
    parser.add_argument('--case', required=True, choices=[c['id'] for c in CASES])
    parser.add_argument('--attempt', type=int, default=1)
    args = parser.parse_args()
    assert Path('/app/storage/.chronology-comparison').is_file()
    root = Path('/qualification'); workspace = json.loads((root/'workspace.json').read_text())
    output = Path('/results'); case = next(c for c in CASES if c['id'] == args.case)
    pid = workspace['project_id']; username = 'chronology-qualification@coair-test.local'
    from qdrant_client import QdrantClient
    blocked = []
    def no_mutation(*values, **kwargs):
        blocked.append('mutation attempted')
        raise RuntimeError('qualification_vector_write_forbidden')
    for name in ('create_collection', 'delete_collection', 'recreate_collection', 'upsert',
                 'upload_collection', 'upload_points', 'set_payload', 'overwrite_payload',
                 'delete_payload', 'clear_payload', 'delete', 'batch_update_points',
                 'create_payload_index', 'delete_payload_index', 'update_collection'):
        if hasattr(QdrantClient, name): setattr(QdrantClient, name, no_mutation)
    from backend.core.security import current_user_var, UserContext
    from src.project_context import set_current_project
    from src.document_rag import corpus_var, get_document_rag
    from src.user_store import get_user_store
    from src.run_store import get_run_store
    from src import llm_client
    from src.config import GEMINI_MODEL, CHRONOLOGY_EVENT_DISCOVERY_MODE
    from src.chronology_prompts import chronology_prompt_hash
    user = get_user_store().get_user(username); assert user
    current_user_var.set(UserContext(username=username, role=user['role'],
        display_name='Private chronology qualification', features=user.get('features') or {},
        token_limit=user['token_limit']))
    set_current_project(pid, 'owner'); corpus_var.set('edinburgh')
    original_text = llm_client.generate_text
    def uncached_text(*values, **kwargs):
        kwargs['ttl_s'] = 0
        return original_text(*values, **kwargs)
    llm_client.generate_text = uncached_text
    from src.chunk_store import get_chunk_store
    get_chunk_store()._con.execute("SET memory_limit='1GB'")
    get_chunk_store()._con.execute("SET threads=1")
    init = time.monotonic()
    rag = get_document_rag(); assert rag.load_index()
    initialization = round(time.monotonic()-init, 2)
    rid = get_run_store().start(project_id=pid, username=username, module='chronology', query=case['topic'])
    started = time.monotonic(); stages = []
    def stage(name, progress):
        row = {'stage':name, 'progress':progress, 'seconds':round(time.monotonic()-started,2)}
        stages.append(row); print(json.dumps(row), flush=True)
    result = {'engine':args.label, 'case':case, 'project_id':pid,
              'model':GEMINI_MODEL, 'prompt_hash':chronology_prompt_hash(),
              'event_discovery_mode':CHRONOLOGY_EVENT_DISCOVERY_MODE,
              'initialization_seconds':initialization, 'provider_response_cache':'disabled',
              'run_id':rid, 'attempt':args.attempt, 'status':'running'}
    prefix = output/(args.label+'-'+args.case+(f'-attempt-{args.attempt}' if args.attempt > 1 else ''))
    assert not prefix.with_suffix('.json').exists(), 'Never overwrite a previous result'
    try:
        from src.ai_reports import generate_chronology
        raw = generate_chronology(project_id=pid, project_name='Edinburgh Tram Inquiry',
            topic=case['topic'], date_from=case['date_from'], date_to=case['date_to'],
            stage_callback=stage)
        blob = raw.pop('docx'); prefix.with_suffix('.docx').write_bytes(blob)
        prefix.with_suffix('.report.json').write_text(json.dumps(raw, indent=2, default=str))
        ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        with zipfile.ZipFile(io.BytesIO(blob)) as package:
            doc = ET.fromstring(package.read('word/document.xml'))
            foot = ET.fromstring(package.read('word/footnotes.xml'))
            refs = [n.get('{'+ns['w']+'}id') for n in doc.findall('.//w:footnoteReference', ns)]
            ids = {n.get('{'+ns['w']+'}id') for n in foot.findall('w:footnote', ns)}
            word = {'paragraphs':len(doc.findall('.//w:p', ns)), 'tables':len(doc.findall('.//w:tbl',ns)),
                    'footnotes':len(refs), 'unresolved_footnotes':len(set(refs)-ids),
                    'sha256':hashlib.sha256(blob).hexdigest()}
        known = {e['source_id']:e for e in raw['evidence']}
        cited = [sid for e in raw['entries'] for c in e['claims'] for sid in c['source_ids']]
        result.update(status='completed', entries=len(raw['entries']),
            dated_entries=sum(e.get('event_type')!='overview' for e in raw['entries']),
            claims=sum(len(e['claims']) for e in raw['entries']),
            evidence_passages=len(known), evidence_files=len({e['file_name'] for e in raw['evidence']}),
            invalid_source_ids=sorted(set(cited)-set(known)), word=word,
            coverage_status=raw.get('coverage_status'), partial_reasons=raw.get('partial_reasons'),
            audit=raw.get('audit'), research_audit=raw.get('research_audit'), pack=raw.get('pack'),
            selected_doc_ids=raw.get('selected_doc_ids'), research_questions=raw.get('research_questions'))
    except Exception as error:
        result.update(status='failed', error_type=type(error).__name__, error=str(error)[:500])
        import traceback; traceback.print_exc()
    result.update(seconds=round(time.monotonic()-started,2), stages=stages, vector_mutations_attempted=len(blocked))
    with get_run_store()._connect() as db:
        row=db.execute('SELECT count(*),sum(prompt_tokens),sum(completion_tokens),sum(reasoning_tokens),sum(cache_hit) FROM llm_calls WHERE run_id=?',[rid]).fetchone()
    result['usage']=dict(zip(['calls','input_tokens','output_tokens','reasoning_tokens','cache_hits'],tuple(row)))
    prefix.with_suffix('.json').write_text(json.dumps(result,indent=2,default=str))
    print(json.dumps({k:result[k] for k in ['engine','case','status','seconds','usage','vector_mutations_attempted']}),flush=True)
    if result['status']!='completed':raise SystemExit(1)


if __name__=='__main__':main()

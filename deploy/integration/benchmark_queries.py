"""Matched-corpus operator benchmark, run only inside disposable API containers.

Requires cloned staging storage/data and a staging-only provider credential.
It writes conversations, usage and reports in the clone; never mount live storage.
"""
import argparse
import asyncio
import hashlib
import io
import json
import sys
from pathlib import Path
import time
import xml.etree.ElementTree as ET
import zipfile


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--label', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', action='store_true')
    parser.add_argument('--bootstrap-reference', action='store_true',
                        help='Create the disposable user through the native RAG schema')
    args = parser.parse_args()
    if not Path('/app/storage/.matched-qualification').is_file():
        raise SystemExit('Refusing to benchmark outside a disposable storage clone')
    sys.path.insert(0, '/app')
    from backend.services.chat_orchestrator import ChatOrchestrator
    from backend.core.security import current_user_var, UserContext
    from src.project_context import set_current_project
    from src.document_rag import corpus_var
    from src.conversation_store import ConversationStore
    from src.router import get_router
    from src.user_store import get_user_store
    from src.run_store import get_run_store, current_run_id_var
    from src.config import GEMINI_MODEL, GEMINI_MODEL_LITE, CACHE_TTL_SECONDS
    workspace = json.loads(Path('/qualification/workspace.json').read_text())
    project = workspace['project_id']
    username = 'demo@coair-test.local'
    if args.bootstrap_reference and get_user_store().get_user(username) is None:
        get_user_store().create_user(username, 'disposable-qualification-only',
            token_limit=1000000, provider_key_ref=workspace['qualification_provider_ref'])
    user = get_user_store().get_user(username)
    assert user, 'Expected only the cloned staging user'
    current_user_var.set(UserContext(username=username, role=user.get('role', 'user'),
        display_name='Qualification', features=user.get('features') or {},
        token_limit=user['token_limit']))
    set_current_project(project, 'owner')
    corpus_var.set(user.get('corpus') or '')
    result = {'label': args.label, 'project_id': project, 'corpus': 'three Edinburgh PDFs / eight page chunks',
              'model': GEMINI_MODEL, 'lite_model': GEMINI_MODEL_LITE,
              'cache_ttl_seconds': CACHE_TTL_SECONDS, 'queries': []}
    # Existing config uses a fixed TTL. Disable only provider response caching
    # in both disposable processes, including callers with import-time defaults.
    from src import llm_client
    generate_text = llm_client.generate_text
    def uncached_text(*values, **kwargs):
        kwargs['ttl_s'] = 0
        return generate_text(*values, **kwargs)
    llm_client.generate_text = uncached_text
    result['provider_response_cache'] = 'disabled by benchmark wrapper'
    init = time.monotonic()
    router = get_router()
    assert router.document_rag.load_index()
    result['initialization_seconds'] = round(time.monotonic() - init, 3)
    store = ConversationStore(username, project)
    orchestrator = ChatOrchestrator()
    cases = [
        ('selected_document', "According to CEC01546478.pdf, what is Parsons Brinckerhoff's role in the utilities diversion programme? Cite the source.", ['161298c26281926a']),
        ('followup', 'What source supports that role? Cite its document and page.', ['161298c26281926a']),
        ('standalone_after_history', 'According to CEC01123743.pdf, what is the purpose of the utilities diversion programme? Cite the source.', ['0235aed85faa16ec']),
    ]
    for repeat in range(2):
        conversation = store.create_conversation('Matched qualification')
        for index, (name, question, doc_ids) in enumerate(cases):
            rid = f'qualification-{args.label}-{repeat}-{index}-{time.time_ns()}'
            started = time.monotonic()
            item = dict(case=name, repeat=repeat + 1, question=question, request_id=rid)
            try:
                answer = await orchestrator.process(query=question, conversation_id=conversation.conversation_id,
                    router=router, store=store, doc_ids=doc_ids, username=username, request_id=rid,
                    project_id=project, project_role='owner')
                raw = answer.model_dump()
                item.update(status='completed', answer=raw, citations=len(raw.get('citations') or []),
                    selection_scope_passed=all(c.get('doc_id') in doc_ids for c in raw.get('citations') or []))
            except Exception as error:
                item.update(status='failed', error_type=type(error).__name__, error=str(error)[:300])
            item['seconds'] = round(time.monotonic() - started, 3)
            with get_run_store()._connect() as db:
                row = db.execute('SELECT COUNT(*),SUM(prompt_tokens),SUM(completion_tokens),SUM(reasoning_tokens),SUM(cache_hit) FROM llm_calls WHERE run_id=?', [rid]).fetchone()
            item['usage'] = dict(zip(('calls', 'input_tokens', 'output_tokens', 'reasoning_tokens', 'cache_hits'), tuple(row)))
            result['queries'].append(item)
            Path(args.output).write_text(json.dumps(result, indent=2, default=str))
            print(json.dumps({k: item[k] for k in ('case', 'repeat', 'status', 'seconds', 'usage')}), flush=True)
    if args.report:
        from src.ai_reports import generate_chronology
        stages = []
        rid = get_run_store().start(project_id=project, username=username,
            module='chronology', query='Utilities diversion programme and Parsons Brinckerhoff responsibilities')
        started = time.monotonic()
        report = {}
        try:
            raw = generate_chronology(project_id=project, project_name='Edinburgh — integration sample',
                topic='Utilities diversion programme and Parsons Brinckerhoff responsibilities',
                source_doc_ids=['161298c26281926a', '0235aed85faa16ec', '8a04f0812c996d8b'],
                stage_callback=lambda stage, progress: stages.append(dict(stage=stage, progress=progress,
                    seconds=round(time.monotonic() - started, 3))))
            blob = raw['docx']
            Path(args.output).with_suffix('.docx').write_bytes(blob)
            with zipfile.ZipFile(io.BytesIO(blob)) as package:
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                document = ET.fromstring(package.read('word/document.xml'))
                feet = ET.fromstring(package.read('word/footnotes.xml'))
                refs = document.findall('.//w:footnoteReference', ns)
                ids = {n.attrib['{' + ns['w'] + '}id'] for n in feet.findall('w:footnote', ns)}
                assert all(n.attrib['{' + ns['w'] + '}id'] in ids for n in refs)
                report.update(status='completed', records=len(raw['entries']), footnotes=len(refs),
                    tables=len(document.findall('.//w:tbl', ns)), bytes=len(blob),
                    coverage_status=raw.get('coverage_status'), partial_reasons=raw.get('partial_reasons'),
                    sha256=hashlib.sha256(blob).hexdigest())
        except Exception as error:
            report.update(status='failed', error_type=type(error).__name__, error=str(error)[:300])
        report.update(seconds=round(time.monotonic() - started, 3), stages=stages, run_id=rid)
        with get_run_store()._connect() as db:
            row = db.execute('SELECT COUNT(*),SUM(prompt_tokens),SUM(completion_tokens),SUM(reasoning_tokens) FROM llm_calls WHERE run_id=?', [rid]).fetchone()
        report['usage'] = dict(zip(('calls', 'input_tokens', 'output_tokens', 'reasoning_tokens'), tuple(row)))
        result['report'] = report
        print(json.dumps(report), flush=True)
    Path(args.output).write_text(json.dumps(result, indent=2, default=str))
    if any(item['status'] != 'completed' or not item['citations'] for item in result['queries']):
        raise SystemExit('One or more matched chat queries failed or lacked citations')
    if args.label == 'coair' and any(not item.get('selection_scope_passed') for item in result['queries']):
        raise SystemExit('A target response escaped the selected documents')
    if args.report and result['report']['status'] != 'completed':
        raise SystemExit('Matched report failed')


if __name__ == '__main__':
    asyncio.run(main())

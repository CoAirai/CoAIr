"""Offline regression of accepted RAG outputs; never a report-serving path.

The reference contains private evidence and cached provider outputs, and must
stay outside the application tree. No provider calls or live storage writes are
permitted. This checks downstream preservation, not fresh-generation quality.
"""
import argparse
import base64
from copy import deepcopy
from dataclasses import fields
import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import zipfile
import xml.etree.ElementTree as ET


def word_signature(blob):
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    with zipfile.ZipFile(io.BytesIO(blob)) as package:
        doc = ET.fromstring(package.read('word/document.xml'))
        foot = ET.fromstring(package.read('word/footnotes.xml'))
        # Whitespace/layout nodes are not text; compare actual visible words.
        paragraphs = [''.join(t.text or '' for t in p.findall('.//w:t', ns)) for p in doc.findall('.//w:p', ns)]
        refs = [n.get('{'+ns['w']+'}id') for n in doc.findall('.//w:footnoteReference', ns)]
        ids = {n.get('{'+ns['w']+'}id') for n in foot.findall('w:footnote', ns)}
        return {'paragraphs': paragraphs, 'footnotes': len(refs),
                'tables': len(doc.findall('.//w:tbl', ns)), 'resolved': set(refs) <= ids,
                'footnote_texts': [''.join(t.text or '' for t in p.findall('.//w:t',ns))
                                   for p in foot.findall('w:footnote',ns)]}


def main():
    parser = argparse.ArgumentParser();parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True);args = parser.parse_args()
    from src.ai_reports import _generate_chronology_v2
    from src.evidence_model import EvidenceItem
    result = []
    for golden in json.loads(args.reference.read_text()):
        raw = golden['result']; request = golden['request']
        allowed = {f.name for f in fields(EvidenceItem)}
        evidence = [EvidenceItem(**{k:v for k,v in item.items() if k in allowed}) for item in raw['evidence']]
        used = []
        def checkpoint(key, _hash):
            used.append(key)
            return deepcopy(golden['steps'].get(key))
        def forbidden(*args, **kwargs):
            raise AssertionError('Replay must not call a provider')
        with patch('src.chronology_v2.evidence_from_documents', return_value=evidence), \
             patch('src.ai_reports.select_pack', return_value=SimpleNamespace(evidence=evidence, stats={'mode':'frozen-selected-evidence'})), \
             patch('src.llm_client.generate_response_json', side_effect=forbidden):
            generated = _generate_chronology_v2(project_id=golden['project_id'],
                project_name=request['project_name'], topic=request['topic'],
                issue_number=int(raw['entries'][0]['entry_ref'].split('.')[1]),
                source_doc_ids=raw['selected_doc_ids'],
                preparation={'prepared': {'english_query': request['topic'], 'research_queries': raw['research_questions']}},
                load_step=checkpoint)
        expected_entries = raw['entries']; actual_entries = generated['entries']
        # Dates, claim wording, source IDs, attribution and ordering are all protected.
        assert actual_entries == expected_entries, 'Accepted narrative entries changed'
        actual = word_signature(generated['docx'])
        expected = word_signature(base64.b64decode(golden['original_word_base64']))
        assert actual == expected, 'Visible Word narrative or footnotes changed'
        assert actual['resolved'] and actual['tables'] == 0
        args.output.parent.joinpath('replayed-'+golden['job_id']+'.docx').write_bytes(generated['docx'])
        row = {'reference_job_id':golden['job_id'], 'entries':len(actual_entries),
               'evidence_passages':len(evidence), 'source_documents':len({x.file_name for x in evidence}),
               'paragraphs':len(actual['paragraphs']), 'footnotes':actual['footnotes'],
               'visible_word_equal':True, 'entries_equal':True, 'provider_calls':0,
               'reference_sha256':golden['original_word_sha256'],
               'checkpoint_keys':sorted(set(used))}
        result.append(row);print(json.dumps(row),flush=True)
    args.output.write_text(json.dumps({'accepted':True,'kind':'cached-output regression, not fresh generation','reports':result},indent=2)+'\n')


if __name__ == '__main__': main()

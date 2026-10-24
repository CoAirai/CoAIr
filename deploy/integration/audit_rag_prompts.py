"""Inventory prompt differences against a supplied, trusted RAG source checkout.

Read-only: this command never rewrites prompts or interprets matched text as
instructions. Identical hashes establish text/AST parity, not response quality.
"""
from __future__ import annotations
import argparse
import ast
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/"api"))
from src.prompt_contract import signature

MODULES = ('react_agent', 'query_planner', 'hybrid_executor', 'router',
           'data_analyzer_sql', 'document_rag', 'ai_reports', 'content_generator',
           'chronology_v2', 'chronology_v3')


def prompts(path):
    tree = ast.parse(path.read_text())
    found = {}
    def visit(node, scope=''):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                visit(child, scope + child.name + '.')
            elif isinstance(child, (ast.Assign, ast.AnnAssign)):
                names = [n.id for n in (child.targets if isinstance(child, ast.Assign) else [child.target])
                         if isinstance(n, ast.Name)]
                value = child.value
                if isinstance(value, (ast.Constant, ast.JoinedStr)) and any(
                    'prompt' in n.lower() or 'system' in n.lower() or (n == 'base' and scope.endswith('synthesize.')) for n in names
                ):
                    found[scope + ','.join(names)] = signature(value)
            else:
                visit(child, scope)
    visit(tree)
    return found


def compare(reference, target):
    rows = []
    for module in MODULES:
        a, b = prompts(reference/'src'/f'{module}.py'), prompts(target/'src'/f'{module}.py')
        rows.extend({'module': module, 'prompt': name,
                     'status': 'same' if value == b.get(name) else 'different' if name in b else 'missing',
                     'rag_sha256': value, 'coair_sha256': b.get(name)}
                    for name, value in a.items())
    for filename in ('chronology_v2.yaml', 'chronology_v3.yaml'):
        a = (reference/'config/prompts'/filename).read_bytes()
        b = (target/'config/prompts'/filename).read_bytes()
        rows.append({'module': 'prompt_files', 'prompt': filename,
                     'status': 'same' if a == b else 'different',
                     'rag_sha256': hashlib.sha256(a).hexdigest(),
                     'coair_sha256': hashlib.sha256(b).hexdigest()})
    return {'reference': str(reference), 'target': str(target), 'prompts': rows,
            'summary': {s: sum(r['status'] == s for r in rows) for s in ('same', 'different', 'missing')}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--rag', type=Path, required=True)
    parser.add_argument('--coair-api', type=Path, default=Path('api'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.rag.resolve(), args.coair_api.resolve())
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result['summary']))

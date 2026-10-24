"""Protect accepted RAG prompt behavior from unreviewed prompt edits.

A change requires updating the acceptance evidence and reviewed baseline, not
simply deleting this gate. Full output-quality checks remain separate.
"""
import ast
import hashlib
import json
from pathlib import Path
import pytest
from src.prompt_contract import signature

ROOT = Path(__file__).resolve().parents[1]
BASELINE = json.loads((Path(__file__).parent/'fixtures/rag_accepted_contract.json').read_text())


@pytest.mark.parametrize('contract', BASELINE['contracts'], ids=lambda x: x['module']+':'+x['prompt'])
def test_accepted_rag_prompt_has_not_changed(contract):
    if contract['module'] == 'prompt_files':
        actual = hashlib.sha256((ROOT/'config/prompts'/contract['prompt']).read_bytes()).hexdigest()
    else:
        node = ast.parse((ROOT/'src'/(contract['module']+'.py')).read_text())
        path = contract['prompt'].split('.')
        for name in path[:-1]:
            node = next(n for n in ast.walk(node) if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name==name)
        assignment = next(n for n in ast.walk(node) if isinstance(n,ast.Assign)
            and any(isinstance(t,ast.Name) and t.id==path[-1] for t in n.targets))
        actual = signature(assignment.value)
    assert actual == contract['rag_sha256'], 'Accepted prompt changed: review output regressions first'

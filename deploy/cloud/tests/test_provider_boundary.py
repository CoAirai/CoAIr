"""Protect the cloud PR without importing SDKs, reading keys or calling models."""
import ast
import logging
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]


class CloudProviderBoundaryTests(unittest.TestCase):
    def test_cloud_default_remains_gemini(self):
        tree = ast.parse((ROOT / 'api/src/config.py').read_text())
        defaults = [node.args[1].value for node in ast.walk(tree)
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'getenv' and len(node.args) >= 2
                    and isinstance(node.args[0], ast.Constant)
                    and node.args[0].value == 'LLM_PRIMARY_PROVIDER'
                    and isinstance(node.args[1], ast.Constant)]
        self.assertEqual(defaults, ['gemini'])

    def test_cloud_provider_routing_cannot_select_local_inference(self):
        tree = ast.parse((ROOT / 'api/src/llm_client.py').read_text())
        function = next(node for node in tree.body
                        if isinstance(node, ast.FunctionDef) and node.name == 'primary_llm_provider')
        module = ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[]))
        for configured, key, expected in [('gemini', '', 'gemini'), ('zai', 'test-only', 'zai'),
                                          ('zai', '', 'gemini'), ('vllm', '', 'gemini')]:
            with self.subTest(configured=configured, has_key=bool(key)):
                namespace = {'LLM_PRIMARY_PROVIDER': configured, 'ZAI_API_KEY': key,
                             'logger': logging.getLogger(__name__)}
                exec(compile(module, 'cloud_provider_boundary', 'exec'), namespace)
                self.assertEqual(namespace['primary_llm_provider'](), expected)

    def test_appliance_transport_and_installation_are_not_in_cloud_tree(self):
        for relative in ('api/src/openai_compatible.py', 'api/src/local_llama.py',
                         'deploy/dgx/compose.secure.yaml', 'deploy/dgx/install_secure.py'):
            with self.subTest(path=relative):
                self.assertFalse((ROOT / relative).exists(),
                                 'DGX-only files must stay on the appliance branch')


if __name__ == '__main__':
    unittest.main()

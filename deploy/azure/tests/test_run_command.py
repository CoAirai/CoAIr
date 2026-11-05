import subprocess
import sys
import unittest

from _support import ROOT, load

sys.path.insert(0, str(ROOT / "deploy/azure"))
deploy = load("azure_command_fixture", ROOT / "deploy/azure/run_command.py")
COMMIT = "a" * 40
API = "ghcr.io/coairai/coair-integration-api:" + COMMIT
WEB = API.replace("integration-api", "integration-web")
ORIGIN = "https://azure.example.com"


class RunCommandTests(unittest.TestCase):
    def test_identity_gate_precedes_every_persistent_write(self):
        script = deploy.script(COMMIT, API, WEB, ORIGIN, b"guard", b"archive")
        self.assertLess(script.index("--check-only"), script.index('mkdir -p "$release"'))
        self.assertLess(script.index("--check-only"), script.index("tar -xzf"))
        self.assertGreater(script.index("COAIR_AZURE_RELEASE="), script.index('python3 "$release/'))
        subprocess.run(["bash", "-n"], input=script, text=True, check=True)

    def test_wrong_pair_or_unqualified_origin_is_rejected(self):
        for web, origin in [(WEB.replace(COMMIT, "b" * 40), ORIGIN), (WEB, "https://azure.invalid")]:
            with self.assertRaises(ValueError):
                deploy.script(COMMIT, API, web, origin, b"guard", b"archive")

    def test_command_completion_without_release_confirmation_is_not_success(self):
        for message in ["Enable succeeded", "COAIR_AZURE_RELEASE=" + "b" * 40,
                        "prefix COAIR_AZURE_RELEASE=" + COMMIT]:
            with self.assertRaises(RuntimeError):
                deploy.accepted_result({"value": [{"message": message}]}, COMMIT)
        deploy.accepted_result({"value": [{"message": "output\nCOAIR_AZURE_RELEASE=" + COMMIT}]}, COMMIT)

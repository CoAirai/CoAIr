import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("integration_release", Path(__file__).parents[1] / "release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseGuardTests(unittest.TestCase):
    def test_production_or_moving_images_never_reach_docker(self):
        for image in ("coair-chronology:20261021-clean-list", "ghcr.io/coairai/coair-integration-api:latest"):
            with self.subTest(image=image), patch.object(sys, "argv", ["release", "--api-image", image, "--web-image", image]), patch.object(release.subprocess, "run") as run:
                with self.assertRaises(SystemExit):
                    release.main()
                run.assert_not_called()

    def test_mismatched_commits_never_reach_docker(self):
        with patch.object(sys, "argv", ["release", "--api-image", "ghcr.io/coairai/coair-integration-api:" + "a" * 40, "--web-image", "ghcr.io/coairai/coair-integration-web:" + "b" * 40]), patch.object(release.subprocess, "run") as run:
            with self.assertRaises(SystemExit):
                release.main()
            run.assert_not_called()

    def test_failed_release_restores_previous_images(self):
        import json
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "api.env").touch()
            previous = {"INTEGRATION_API_IMAGE": "previous-api", "INTEGRATION_WEB_IMAGE": "previous-web"}
            (root / "release.json").write_text(json.dumps(previous))
            failure = release.subprocess.CalledProcessError(1, "docker")
            with patch.object(release, "ROOT", root), patch.object(sys, "argv", ["release", "--api-image", "ghcr.io/coairai/coair-integration-api:" + "a" * 40, "--web-image", "ghcr.io/coairai/coair-integration-web:" + "a" * 40]), patch.object(release.subprocess, "run", side_effect=[None, failure, None]) as run:
                with self.assertRaises(release.subprocess.CalledProcessError):
                    release.main()
                self.assertEqual(run.call_args_list[-1].kwargs["env"]["INTEGRATION_API_IMAGE"], "previous-api")
                self.assertEqual(json.loads((root / "release.json").read_text()), previous)

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from _support import ROOT, load

release = load("azure_release_fixture", ROOT / "deploy/azure/release.py")
API = "ghcr.io/coairai/coair-integration-api:" + "a" * 40
WEB = "ghcr.io/coairai/coair-integration-web:" + "a" * 40
OLD_API = API.replace("a" * 40, "b" * 40)
OLD_WEB = WEB.replace("a" * 40, "b" * 40)
ORIGIN = "https://azure-demo.example.com"


def config():
    return {"services": {
        "api": {"image": API, "ports": [{"host_ip": "127.0.0.1"}], "environment": {
            "COAIR_ENFORCE_STATE_OWNER": "true", "WEB_CONCURRENCY": "1",
            "COAIR_STATEFUL_API_REPLICAS": "1", "COAIR_WORKER_MODE": "embedded"}, "volumes": [
                {"type": "bind", "source": "/srv/coair/data", "target": "/app/data"},
                {"type": "bind", "source": "/srv/coair/storage", "target": "/app/storage"}]},
        "web": {"image": WEB, "ports": [{"host_ip": "127.0.0.1"}]},
        "qdrant": {"image": "qdrant/qdrant:v1.15.4", "volumes": [
            {"type": "bind", "source": "/srv/coair/qdrant", "target": "/qdrant/storage"}]},
    }}


class AzureReleaseTests(unittest.TestCase):
    def test_moving_wrong_role_or_mismatched_images_are_rejected(self):
        for api, web in [(API.replace("a" * 40, "latest"), WEB), (WEB, API), (API, OLD_WEB)]:
            with self.subTest(api=api), self.assertRaises(ValueError):
                release.image_pair(api, web)

    def test_only_a_configured_public_https_origin_is_allowed(self):
        for origin in ["http://demo.example.com", "https://user:pass@demo.example.com", ORIGIN + "/",
                       ORIGIN + "?sig=secret", "https://127.0.0.1", "https://azure.invalid"]:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                release.public_origin(origin)
        self.assertEqual(release.public_origin(ORIGIN), ORIGIN)

    def test_azure_identity_and_acceptance_fail_before_docker_mutation(self):
        with patch.object(release, "target_config", side_effect=ValueError("wrong VM")), patch.object(release.subprocess, "run") as run:
            with self.assertRaises(ValueError):
                release.deploy(API, WEB, ORIGIN)
            run.assert_not_called()

    def test_healthy_endpoint_at_the_wrong_commit_is_not_a_success(self):
        with patch.object(release, "read_json_url", return_value={"status": "ok", "commit": "b" * 40}):
            with self.assertRaises(ValueError): release.smoke(ORIGIN, "a" * 40)

    def test_persistent_mounts_private_ports_and_state_owner_are_required(self):
        target = {"qdrant_image": "qdrant/qdrant:v1.15.4"}
        release.validate_compose(config(), target, API, WEB)
        for change in [
            lambda c: c["services"]["api"]["volumes"][0].update(source="/opt/mvp-api/data"),
            lambda c: c["services"]["web"]["ports"][0].update(host_ip="0.0.0.0"),
            lambda c: c["services"]["api"]["environment"].update(WEB_CONCURRENCY="2"),
            lambda c: c["services"]["qdrant"].update(image="qdrant/qdrant:latest"),
        ]:
            value = config(); change(value)
            with self.assertRaises(ValueError):
                release.validate_compose(value, target, API, WEB)

    def test_imds_must_match_both_subscription_and_vm(self):
        with tempfile.TemporaryDirectory() as root_name, tempfile.TemporaryDirectory() as state_name:
            root, state = Path(root_name).resolve(), Path(state_name).resolve()
            target = {"environment": "azure-demo", "acceptance_complete": True, "public_origin": ORIGIN,
                      "vm_id": "approved-vm", "subscription_id": "approved-subscription"}
            for name in ("api.env", ".env", "release.json"): (root / name).touch()
            (root / "target.json").write_text(json.dumps(target))
            for name in ("data", "storage", "qdrant"): (state / name).mkdir()
            for identity in [{"vmId": "wrong-vm", "subscriptionId": "approved-subscription"},
                             {"vmId": "approved-vm", "subscriptionId": "wrong-subscription"}]:
                with patch.object(release, "ROOT", root), patch.object(release, "STATE_ROOT", state), patch.object(release, "read_json_url", return_value={"compute": identity}):
                    with self.assertRaises(ValueError): release.target_config(ORIGIN)

    def test_dedicated_provider_keys_require_an_exact_read_only_mount(self):
        target = {"qdrant_image": "qdrant/qdrant:v1.15.4"}
        value = config()
        secret = {"type": "bind", "source": "/opt/coair-azure/provider-keys",
                  "target": "/run/secrets/google_keys", "read_only": True}
        value["services"]["api"]["volumes"].append(secret)
        release.validate_compose(value, target, API, WEB)
        secret["read_only"] = False
        with self.assertRaises(ValueError): release.validate_compose(value, target, API, WEB)

    def test_legacy_toolkit_secret_is_read_only_and_outside_customer_state(self):
        value = config(); target = {"qdrant_image": "qdrant/qdrant:v1.15.4"}
        secret = {"type": "bind", "source": "/opt/coair-azure/toolkit-secrets.toml",
                  "target": "/app/.streamlit/secrets.toml", "read_only": True}
        value["services"]["toolkit"] = {"volumes": [secret]}
        release.validate_compose(value, target, API, WEB)
        secret["read_only"] = False
        with self.assertRaises(ValueError): release.validate_compose(value, target, API, WEB)
        secret.update(read_only=True, source="/etc")
        with self.assertRaises(ValueError): release.validate_compose(value, target, API, WEB)

    def test_failed_smoke_rolls_back_images_and_keeps_previous_record(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            previous = {"API_IMAGE": OLD_API, "WEB_IMAGE": OLD_WEB, "public_origin": ORIGIN}
            (root / "release.json").write_text(json.dumps(previous))
            old_compose = root / "releases" / ("b" * 40) / "deploy/azure/compose.yml"
            old_compose.parent.mkdir(parents=True)
            old_compose.touch()
            labels = {"com.coair.public-origin": ORIGIN, "org.opencontainers.image.revision": "a" * 40}
            with patch.object(release, "ROOT", root), patch.object(release, "target_config", return_value={"qdrant_image": "qdrant/qdrant:v1.15.4"}), patch.object(release, "docker_json", side_effect=[config(), [{"Config": {"Labels": labels}}]]), patch.object(release.subprocess, "run") as run, patch.object(release, "smoke", side_effect=[ValueError("wrong public commit"), None]) as smoke:
                with self.assertRaises(ValueError): release.deploy(API, WEB, ORIGIN)
                self.assertEqual(run.call_args.kwargs["env"]["API_IMAGE"], OLD_API)
                self.assertEqual(run.call_args.args[0][-2:], ["api", "web"])
                self.assertIn("--no-deps", run.call_args.args[0])
                self.assertIn(str(old_compose), run.call_args.args[0])
                self.assertEqual(json.loads((root / "release.json").read_text()), previous)
                self.assertEqual(smoke.call_args.args, (ORIGIN, "b" * 40))

    def test_success_records_pair_and_preserves_one_rollback_record(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            previous = {"API_IMAGE": OLD_API, "WEB_IMAGE": OLD_WEB, "public_origin": ORIGIN}
            (root / "release.json").write_text(json.dumps(previous))
            old_compose = root / "releases" / ("b" * 40) / "deploy/azure/compose.yml"
            old_compose.parent.mkdir(parents=True)
            old_compose.touch()
            labels = {"com.coair.public-origin": ORIGIN, "org.opencontainers.image.revision": "a" * 40}
            with patch.object(release, "ROOT", root), patch.object(release, "target_config", return_value={"qdrant_image": "qdrant/qdrant:v1.15.4"}), patch.object(release, "docker_json", side_effect=[config(), [{"Config": {"Labels": labels}}]]), patch.object(release.subprocess, "run"), patch.object(release, "smoke"):
                release.deploy(API, WEB, ORIGIN)
                record = json.loads((root / "release.json").read_text())
                self.assertEqual(record["API_IMAGE"], API)
                self.assertEqual(record["previous"], previous)

import asyncio
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from _support import ROOT, load
owner = load('state_owner', ROOT / 'api/backend/core/state_owner.py')

class StateOwnerTests(unittest.TestCase):
    def test_default_runtime_is_unchanged(self):
        self.assertFalse(owner.validate_topology({}))

    def test_replica_worker_and_process_misconfiguration_fails_closed(self):
        for extra in ({'COAIR_STATEFUL_API_REPLICAS': '2'}, {'WEB_CONCURRENCY': '2'}, {'COAIR_WORKER_MODE': 'external'}, {'COAIR_STATEFUL_API_REPLICAS': 'bad'}):
            with self.subTest(extra=extra), self.assertRaises(RuntimeError): owner.validate_topology({'COAIR_ENFORCE_STATE_OWNER': 'true', **extra})

    def test_second_process_cannot_recover_the_same_storage(self):
        script = "import importlib.util,sys; s=importlib.util.spec_from_file_location('owner',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.acquire_state_owner(sys.argv[2], {'COAIR_ENFORCE_STATE_OWNER':'true'}); print('owned',flush=True); sys.stdin.read()"
        with tempfile.TemporaryDirectory() as folder:
            command = [sys.executable, '-c', script, str(ROOT / 'api/backend/core/state_owner.py'), folder]
            first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertEqual(first.stdout.readline().strip(), 'owned')
                second = subprocess.run(command, input='', capture_output=True, text=True, timeout=5)
                self.assertNotEqual(second.returncode, 0)
                self.assertIn('Another API process owns this storage', second.stderr)
            finally:
                first.communicate('', timeout=5)
            resumed = subprocess.run(command, input='', capture_output=True, text=True, timeout=5)
            self.assertEqual(resumed.returncode, 0, resumed.stderr)

    def test_owner_check_runs_before_database_or_worker_startup(self):
        calls = []
        modules = {'fastapi': SimpleNamespace(FastAPI=object),
                   'src.config': SimpleNamespace(STORAGE_DIR=Path('/unused')),
                   'backend.core.state_owner': owner}
        with patch.dict(sys.modules, modules), patch.dict(os.environ, {'COAIR_ENFORCE_STATE_OWNER': 'true', 'COAIR_STATEFUL_API_REPLICAS': '2'}):
            runtime = load('guarded_lifespan', ROOT / 'api/backend/core/lifespan.py')
            runtime._startup_critical = lambda: calls.append('database')
            async def start():
                async with runtime.lifespan(object()):
                    calls.append('serving')
            with self.assertRaises(RuntimeError): asyncio.run(start())
        self.assertEqual(calls, [])

    def test_lockfile_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / '.state-owner.lock').symlink_to('/dev/null')
            with self.assertRaises(OSError): owner.acquire_state_owner(folder, {'COAIR_ENFORCE_STATE_OWNER': 'true'})



"""The shipped API must match its qualified runtime dependency closure."""
from importlib import metadata
from pathlib import Path
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name


def test_runtime_matches_qualified_lock():
    pins = {}
    for line in (Path(__file__).resolve().parents[1] / 'requirements.lock').read_text().splitlines():
        if line and not line.startswith('#'):
            name, version = line.split('==')
            pins[canonicalize_name(name)] = version
            assert metadata.version(name) == version, f'{name} drifted from the qualified runtime'
    for line in (Path(__file__).resolve().parents[1] / 'requirements.txt').read_text().splitlines():
        if line and not line.startswith(('#','-')):
            req = Requirement(line)
            assert canonicalize_name(req.name) in pins
            assert pins[canonicalize_name(req.name)] in req.specifier

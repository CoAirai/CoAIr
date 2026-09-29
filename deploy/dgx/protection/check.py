"""Run inside a protected container; emits no key, source or customer data."""
import json
import sys
sys.path.insert(0, "/app")
from pathlib import Path
import coair_protected

manifest = coair_protected.activate()
from src.chronology_prompts import load_chronology_prompts, load_chronology_v3_prompts
from src.local_metadata import Metadata
from src.chronology_dates import event_date_is_grounded
forbidden = [str(p) for pattern in ('*.py', '*.pyc', '*.pyx', '*.c', '*.map') for p in Path('/app').rglob(pattern)
             if not any(part in ('data', 'storage', 'cache', 'logs') for part in p.relative_to('/app').parts)]
assert not forbidden, forbidden
assert not Path('/app/config/prompts/chronology_v2.yaml').exists()
assert not Path('/app/config/prompts/chronology_v3.yaml').exists()
assert Metadata.model_json_schema()['properties']
assert event_date_is_grounded('2007-04-12', 'exact', 'content_body', '12 April 2007', ['Inspection on 12 April 2007'])
print(json.dumps({'verified': True, 'release': manifest['release'],
    'encrypted_modules': manifest['encrypted_modules'], 'compiled_modules': manifest['compiled_modules'],
    'encrypted_resources': manifest['encrypted_resources'], 'plain_application_sources': len(forbidden),
    'v2_prompt_loaded': bool(load_chronology_prompts()), 'v3_prompt_loaded': bool(load_chronology_v3_prompts()),
    'protection': manifest['protection']}))

"""Inspect every saved image layer, including hidden lower layers."""
import argparse
import json
from pathlib import PurePosixPath
import tarfile

p = argparse.ArgumentParser(); p.add_argument('archive'); a = p.parse_args()
forbidden = []
layers = 0
with tarfile.open(a.archive) as outer:
    manifest = json.load(outer.extractfile('manifest.json'))
    for layer_name in dict.fromkeys(name for image in manifest for name in image['Layers']):
        layers += 1
        with tarfile.open(fileobj=outer.extractfile(layer_name), mode='r|*') as layer:
            for member in layer:
                name = member.name.removeprefix('./')
                path = PurePosixPath(name)
                if not member.isfile(): continue
                if name.startswith('app/') and (path.suffix in ('.py', '.pyc', '.pyx', '.c', '.map')
                        or '/.git/' in name or name.endswith(('chronology_v2.yaml', 'chronology_v3.yaml'))):
                    forbidden.append(name)
                if name.startswith('run/secrets/') or path.name in ('signing.key', 'device.key', 'coair-protection.key'):
                    forbidden.append(name)
assert not forbidden, forbidden
print(json.dumps({'all_layers_audited': layers, 'plain_application_source_or_key_files': 0, 'passed': True}))

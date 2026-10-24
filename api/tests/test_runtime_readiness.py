"""A deployment must wait for actual validation, not its background thread start."""
import asyncio
import json

import pytest


@pytest.mark.parametrize('ready,error,status', [
    (False, '', 'initializing'),
    (False, 'dependency incompatible', 'unhealthy'),
    (True, '', 'ok'),
])
def test_health_distinguishes_initializing_failed_and_ready(monkeypatch, ready, error, status):
    import backend.main as main
    monkeypatch.setattr(main, '_health_ready', ready)
    monkeypatch.setattr(main, '_health_error', error)
    health = next(route.endpoint for route in main.app.routes if getattr(route, 'path', None) == '/api/health')
    response = asyncio.run(health())
    if ready:
        assert response == {'status': 'ok', 'chronology': 'ready', 'vector_runtime': 'ready'}
    else:
        assert response.status_code == 503
        assert json.loads(response.body)['status'] == status

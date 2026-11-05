"""A healthy public endpoint must identify the actual release for deploy checks."""
from fastapi.testclient import TestClient


def test_health_reports_the_running_commit_without_starting_workers(monkeypatch):
    import backend.main as main
    monkeypatch.setattr(main, "_health_ready", True)
    monkeypatch.setenv("COAIR_COMMIT_SHA", "a" * 40)
    app = main.create_app()
    # No context manager: this read-only route check does not start lifespan jobs.
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["commit"] == "a" * 40

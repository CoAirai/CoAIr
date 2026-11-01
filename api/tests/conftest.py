import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(autouse=True)
def _fresh_rate_limiter(monkeypatch):
    """Each test gets its own in-process limiter.

    The limiter is module-global and every TestClient shares one client address,
    so without this, login/MFA attempts from earlier tests exhaust later tests'
    quotas. Limits still apply within a single test.
    """
    from backend.core import platform_guard

    monkeypatch.setattr(platform_guard, "_rate_limiter", platform_guard.RateLimiter())

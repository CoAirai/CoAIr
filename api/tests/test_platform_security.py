"""Unit tests for platform security helpers."""

from __future__ import annotations

from pathlib import Path


def test_ip_allowed_exact_and_cidr():
    from backend.core.platform_guard import ip_allowed

    assert ip_allowed("203.0.113.10", []) is True
    assert ip_allowed("203.0.113.10", ["203.0.113.10"]) is True
    assert ip_allowed("203.0.113.11", ["203.0.113.10"]) is False
    assert ip_allowed("203.0.113.40", ["203.0.113.0/24"]) is True
    assert ip_allowed("198.51.100.1", ["203.0.113.0/24"]) is False


def test_upload_rejects_unknown_extensions_in_source():
    source = Path(__file__).resolve().parents[1] / "backend" / "services" / "file_service.py"
    text = source.read_text(encoding="utf-8")
    assert 'if ext not in EXTENSION_MAP:' in text
    assert "unsupported_file_type" in text

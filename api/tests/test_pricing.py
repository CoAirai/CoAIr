from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("JWT_SECRET", "test-secret-please-replace-in-prod")

from src.pricing import apply_coupon_discount, apply_tax, resolve_charge


@pytest.fixture()
def ops(tmp_path, monkeypatch):
    from src import ops_store as ops_store_module

    store = ops_store_module.OpsStore(db_path=tmp_path / "ops.db")
    monkeypatch.setattr(ops_store_module.OpsStore, "_instance", store)
    return store


def test_percent_and_fixed_coupon_math():
    percent = apply_coupon_discount(
        100, {"discount_type": "percent", "discount_value": 10}
    )
    assert percent["discount_usd"] == 10
    assert percent["subtotal_usd"] == 90

    fixed = apply_coupon_discount(
        40, {"discount_type": "fixed", "discount_value": 15}
    )
    assert fixed["discount_usd"] == 15
    assert fixed["subtotal_usd"] == 25

    capped = apply_coupon_discount(
        10, {"discount_type": "fixed", "discount_value": 50}
    )
    assert capped["discount_usd"] == 10
    assert capped["subtotal_usd"] == 0


def test_tax_on_subtotal():
    taxed = apply_tax(100, 5)
    assert taxed["tax_usd"] == 5
    assert taxed["total_usd"] == 105


def test_resolve_charge_with_coupon_and_tax(ops):
    ops.create_coupon(code="SAVE10", discount_type="percent", discount_value=10)
    ops.set_tax(percent=5, region_label="UAE")
    priced = resolve_charge(ops, 100, coupon_code="save10")
    assert priced["base_usd"] == 100
    assert priced["discount_usd"] == 10
    assert priced["subtotal_usd"] == 90
    assert priced["tax_usd"] == 4.5
    assert priced["total_usd"] == 94.5
    assert priced["coupon_code"] == "SAVE10"


def test_resolve_charge_rejects_inactive_coupon(ops):
    coupon = ops.create_coupon(
        code="OFF", discount_type="fixed", discount_value=5
    )
    ops.toggle_coupon(coupon["id"])
    try:
        resolve_charge(ops, 50, coupon_code="OFF")
        assert False, "expected coupon_inactive"
    except ValueError as exc:
        assert str(exc) == "coupon_inactive"

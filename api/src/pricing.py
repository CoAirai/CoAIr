"""Coupon + tax charge math for Stripe checkout and invoices.

Order: base → coupon discount → tax on discounted subtotal → total charged.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from .ops_store import OpsStore


def apply_coupon_discount(
    base_usd: float, coupon: Optional[Dict[str, Any]]
) -> Dict[str, float]:
    base = max(0.0, float(base_usd))
    if not coupon:
        return {"base_usd": base, "discount_usd": 0.0, "subtotal_usd": base}

    dtype = str(coupon.get("discount_type") or "")
    value = float(coupon.get("discount_value") or 0)
    if dtype == "percent":
        discount = min(base, base * (value / 100.0))
    elif dtype == "fixed":
        discount = min(base, max(0.0, value))
    else:
        discount = 0.0
    discount = round(discount, 2)
    subtotal = round(max(0.0, base - discount), 2)
    return {
        "base_usd": round(base, 2),
        "discount_usd": discount,
        "subtotal_usd": subtotal,
    }


def apply_tax(subtotal_usd: float, tax_percent: float) -> Dict[str, float]:
    subtotal = max(0.0, float(subtotal_usd))
    percent = max(0.0, float(tax_percent))
    tax = round(subtotal * (percent / 100.0), 2)
    total = round(subtotal + tax, 2)
    return {
        "subtotal_usd": round(subtotal, 2),
        "tax_percent": percent,
        "tax_usd": tax,
        "total_usd": total,
    }


def resolve_charge(
    ops: OpsStore,
    base_usd: float,
    *,
    coupon_code: Optional[str] = None,
    apply_tax_rate: bool = True,
) -> Dict[str, Any]:
    """Resolve final charge from ops coupons + tax settings.

    Raises ValueError with coupon_* codes when a code is supplied but invalid.
    """
    coupon = None
    code = (coupon_code or "").strip()
    if code:
        coupon = ops.get_active_coupon_by_code(code)

    discounted = apply_coupon_discount(base_usd, coupon)
    tax = ops.get_tax() if apply_tax_rate else {"percent": 0.0, "region_label": ""}
    taxed = apply_tax(discounted["subtotal_usd"], float(tax.get("percent") or 0))

    parts = []
    if coupon:
        parts.append(f"coupon {coupon['code']}")
    if taxed["tax_usd"] > 0:
        region = (tax.get("region_label") or "tax").strip()
        parts.append(f"{taxed['tax_percent']:g}% {region}")
    suffix = f" ({'; '.join(parts)})" if parts else ""

    return {
        "base_usd": discounted["base_usd"],
        "discount_usd": discounted["discount_usd"],
        "subtotal_usd": taxed["subtotal_usd"],
        "tax_percent": taxed["tax_percent"],
        "tax_usd": taxed["tax_usd"],
        "total_usd": taxed["total_usd"],
        "coupon_code": (coupon or {}).get("code") or "",
        "coupon_id": (coupon or {}).get("id") or "",
        "region_label": tax.get("region_label") or "",
        "description_suffix": suffix,
        "pricing": {
            "base_usd": discounted["base_usd"],
            "discount_usd": discounted["discount_usd"],
            "subtotal_usd": taxed["subtotal_usd"],
            "tax_percent": taxed["tax_percent"],
            "tax_usd": taxed["tax_usd"],
            "total_usd": taxed["total_usd"],
            "coupon_code": (coupon or {}).get("code") or "",
            "region_label": tax.get("region_label") or "",
        },
    }

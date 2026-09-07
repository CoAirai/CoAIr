from src.ca_tokens import (
    ca_to_charge_usd,
    ca_to_micros,
    micros_to_ca,
    nanos_to_ca_micros,
)


def test_nanos_to_ca_micros():
    # $0.05 → 0.05 CA → 50_000 micros
    assert nanos_to_ca_micros(50_000_000) == 50_000


def test_ca_micros_roundtrip():
    assert ca_to_micros(42) == 42_000_000
    assert micros_to_ca(42_000_000) == 42.0


def test_sell_charge():
    assert ca_to_charge_usd(100, 1.2) == 120.0

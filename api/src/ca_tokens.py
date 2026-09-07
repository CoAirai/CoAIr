"""CA token helpers.

Customer balances use **CA micros** (1 CA = 1_000_000 micros).
1 CA consumed == $1 of Gemini/provider cost (``usd_per_ca_cost`` default 1.0).
Customers buy CA at ``usd_per_ca_sell`` (default 1.20).
"""

from __future__ import annotations

CA_MICROS = 1_000_000
NANOUSD_PER_USD = 1_000_000_000

# Defaults locked by product: $1 cost / $1.20 sell per CA.
DEFAULT_USD_PER_CA_COST = 1.0
DEFAULT_USD_PER_CA_SELL = 1.2


def ca_to_micros(ca: float | int) -> int:
    return int(round(float(ca or 0) * CA_MICROS))


def micros_to_ca(micros: int | float) -> float:
    return float(micros or 0) / CA_MICROS


def nanos_to_ca_micros(provider_cost_nanos: int) -> int:
    """Map provider USD nanos → CA micros at $1 = 1 CA."""
    nanos = max(0, int(provider_cost_nanos or 0))
    # 1e9 nanos = $1 = 1 CA = 1e6 micros → micros = nanos // 1000
    return nanos // 1000


def ca_micros_to_provider_usd(
    micros: int, usd_per_ca_cost: float = DEFAULT_USD_PER_CA_COST
) -> float:
    return micros_to_ca(micros) * float(usd_per_ca_cost or DEFAULT_USD_PER_CA_COST)


def ca_micros_to_charge_usd(
    micros: int, usd_per_ca_sell: float = DEFAULT_USD_PER_CA_SELL
) -> float:
    return micros_to_ca(micros) * float(usd_per_ca_sell or DEFAULT_USD_PER_CA_SELL)


def ca_to_charge_usd(
    ca: float | int, usd_per_ca_sell: float = DEFAULT_USD_PER_CA_SELL
) -> float:
    return float(ca or 0) * float(usd_per_ca_sell or DEFAULT_USD_PER_CA_SELL)


def usd_price_to_ca_allowance(
    api_credits_usd: float | int,
    usd_per_ca_sell: float = DEFAULT_USD_PER_CA_SELL,
) -> int:
    """Whole CA included for a package priced in USD at the sell rate."""
    sell = float(usd_per_ca_sell or DEFAULT_USD_PER_CA_SELL)
    if sell <= 0:
        return 0
    return int(round(float(api_credits_usd or 0) / sell))

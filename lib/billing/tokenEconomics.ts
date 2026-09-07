export const CA_MICROS = 1_000_000;

export type TokenEconomicsInput = {
  usdPerCaCost: number;
  usdPerCaSell: number;
  /** @deprecated use usdPerCaCost */
  providerTokensPerUsd?: number;
  /** @deprecated use usdPerCaSell */
  sellTokensPerUsd?: number;
};

export function microsToCa(micros: number): number {
  return (micros || 0) / CA_MICROS;
}

export function caToMicros(ca: number): number {
  return Math.round((ca || 0) * CA_MICROS);
}

export function effectiveSellRate(
  global: TokenEconomicsInput,
  override?: number
): number {
  if (override && override > 0) return override;
  return (
    global.usdPerCaSell ||
    global.sellTokensPerUsd ||
    1.2
  );
}

export function effectiveCostRate(global: TokenEconomicsInput): number {
  return global.usdPerCaCost || global.providerTokensPerUsd || 1;
}

/** Customer charge: CA × sell $/CA */
export function chargeUsdForCa(ca: number, sellRate: number): number {
  if (sellRate <= 0 || ca <= 0) return 0;
  return ca * sellRate;
}

/** @deprecated use chargeUsdForCa — kept for call sites still passing “tokens” as CA */
export function chargeUsdForTokens(tokens: number, sellRate: number): number {
  return chargeUsdForCa(tokens, sellRate);
}

export function providerCostUsdForCa(ca: number, costRate: number): number {
  if (costRate <= 0 || ca <= 0) return 0;
  return ca * costRate;
}

export function caFromProviderUsd(usd: number, costRate = 1): number {
  if (costRate <= 0 || usd <= 0) return 0;
  return usd / costRate;
}

export function marginForCa(
  ca: number,
  costRate: number,
  sellRate: number
) {
  const chargeUsd = chargeUsdForCa(ca, sellRate);
  const providerCostUsd = providerCostUsdForCa(ca, costRate);
  const marginUsd = chargeUsd - providerCostUsd;
  const marginPct = chargeUsd > 0 ? marginUsd / chargeUsd : 0;
  return { chargeUsd, providerCostUsd, marginUsd, marginPct };
}

/** @deprecated use marginForCa */
export function marginForTokens(
  tokens: number,
  providerRate: number,
  sellRate: number
) {
  return marginForCa(tokens, providerRate, sellRate);
}

/** Overage price for 1 CA at the sell rate. */
export function overageUsdPerCa(sellRate: number): number {
  return sellRate > 0 ? sellRate : 0;
}

/** @deprecated use overageUsdPerCa */
export function overageUsdPer1kTokens(sellRate: number): number {
  return overageUsdPerCa(sellRate) * 1000;
}

export function isNegativeMargin(
  costRate: number,
  sellRate: number
): boolean {
  return sellRate < costRate;
}

export function formatCa(microsOrCa: number, asMicros = true): string {
  const ca = asMicros ? microsToCa(microsOrCa) : microsOrCa;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(ca);
}

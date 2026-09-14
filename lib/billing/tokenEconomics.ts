export const CA_MICROS = 1_000_000;

/** What company users see: $1 ↔ 1 display CA. */
export const CUSTOMER_FACE_USD_PER_CA = 1;

/** Internal sell default: $1.20 per real CA (≈ $1 → 0.833 real CA). */
export const DEFAULT_USD_PER_CA_SELL = 1.2;

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
    DEFAULT_USD_PER_CA_SELL
  );
}

export function effectiveCostRate(global: TokenEconomicsInput): number {
  return global.usdPerCaCost || global.providerTokensPerUsd || 1;
}

/** Real CA → customer display CA ($1 face unit). */
export function realCaToDisplayCa(
  realCa: number,
  sellRate = DEFAULT_USD_PER_CA_SELL
): number {
  const sell = sellRate > 0 ? sellRate : DEFAULT_USD_PER_CA_SELL;
  return (realCa || 0) * (sell / CUSTOMER_FACE_USD_PER_CA);
}

/** Customer display CA → real CA credited/charged internally. */
export function displayCaToRealCa(
  displayCa: number,
  sellRate = DEFAULT_USD_PER_CA_SELL
): number {
  const sell = sellRate > 0 ? sellRate : DEFAULT_USD_PER_CA_SELL;
  const factor = sell / CUSTOMER_FACE_USD_PER_CA;
  if (factor <= 0) return displayCa || 0;
  return (displayCa || 0) / factor;
}

/** Whole real CA to send to the API from a display CA purchase. */
export function wholeRealCaFromDisplay(
  displayCa: number,
  sellRate = DEFAULT_USD_PER_CA_SELL
): number {
  return Math.max(1, Math.round(displayCaToRealCa(displayCa, sellRate)));
}

/** Customer charge at face rate: display CA × $1. */
export function chargeUsdForDisplayCa(displayCa: number): number {
  if (displayCa <= 0) return 0;
  return displayCa * CUSTOMER_FACE_USD_PER_CA;
}

/** Customer charge: real CA × sell $/CA (internal / super-admin). */
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

/** Company-facing CA label (face units where $1 ≈ 1 CA). */
export function formatDisplayCa(
  microsOrCa: number,
  sellRate = DEFAULT_USD_PER_CA_SELL,
  asMicros = true
): string {
  const real = asMicros ? microsToCa(microsOrCa) : microsOrCa;
  return formatCa(realCaToDisplayCa(real, sellRate), false);
}

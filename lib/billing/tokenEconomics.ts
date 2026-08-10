export type TokenEconomicsInput = {
  providerTokensPerUsd: number;
  sellTokensPerUsd: number;
};

export function effectiveSellRate(
  global: TokenEconomicsInput,
  override?: number
): number {
  return override && override > 0 ? override : global.sellTokensPerUsd;
}

export function chargeUsdForTokens(tokens: number, sellRate: number): number {
  if (sellRate <= 0 || tokens <= 0) return 0;
  return tokens / sellRate;
}

export function providerCostUsdForTokens(
  tokens: number,
  providerRate: number
): number {
  if (providerRate <= 0 || tokens <= 0) return 0;
  return tokens / providerRate;
}

export function marginForTokens(
  tokens: number,
  providerRate: number,
  sellRate: number
) {
  const chargeUsd = chargeUsdForTokens(tokens, sellRate);
  const providerCostUsd = providerCostUsdForTokens(tokens, providerRate);
  const marginUsd = chargeUsd - providerCostUsd;
  const marginPct = chargeUsd > 0 ? marginUsd / chargeUsd : 0;
  return { chargeUsd, providerCostUsd, marginUsd, marginPct };
}

export function overageUsdPer1kTokens(sellRate: number): number {
  return sellRate > 0 ? 1000 / sellRate : 0;
}

export function isNegativeMargin(
  providerRate: number,
  sellRate: number
): boolean {
  return sellRate > providerRate;
}

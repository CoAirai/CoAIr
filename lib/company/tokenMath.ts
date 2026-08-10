export function userAllocation(tokenLimit: number, sharePercent: number): number {
  return Math.floor((tokenLimit * sharePercent) / 100);
}

export function userRemainingInSlice(
  allocation: number,
  tokensUsed: number,
  unusedReleased: boolean
): number {
  if (unusedReleased) return 0;
  return Math.max(0, allocation - tokensUsed);
}

export function sharesSumTo100(shares: number[]): boolean {
  const sum = shares.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) <= 0.01;
}

export function equalizeShares(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor((100 / count) * 100) / 100;
  const shares = Array.from({ length: count }, () => base);
  const drift = 100 - shares.reduce((a, b) => a + b, 0);
  shares[count - 1] = Math.round((shares[count - 1] + drift) * 100) / 100;
  return shares;
}

export function releasedUnusedTokens(
  allocation: number,
  tokensUsed: number
): number {
  return Math.max(0, allocation - tokensUsed);
}

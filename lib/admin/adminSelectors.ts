export function isNearStorageLimit(usedGb: number, limitGb: number): boolean {
  return limitGb > 0 && usedGb / limitGb >= 0.8;
}

export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

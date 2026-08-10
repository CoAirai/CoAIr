import { describe, expect, it } from "vitest";
import {
  chargeUsdForTokens,
  effectiveSellRate,
  marginForTokens,
  overageUsdPer1kTokens,
} from "./tokenEconomics";

describe("tokenEconomics", () => {
  it("charges from sell rate", () => {
    expect(chargeUsdForTokens(8000, 80)).toBe(100);
  });

  it("computes margin", () => {
    const m = marginForTokens(8000, 100, 80);
    expect(m.chargeUsd).toBe(100);
    expect(m.providerCostUsd).toBe(80);
    expect(m.marginUsd).toBe(20);
    expect(m.marginPct).toBeCloseTo(0.2);
  });

  it("derives overage per 1k", () => {
    expect(overageUsdPer1kTokens(80)).toBe(12.5);
  });

  it("uses company override for effective sell rate", () => {
    expect(
      effectiveSellRate(
        { providerTokensPerUsd: 100, sellTokensPerUsd: 80 },
        90
      )
    ).toBe(90);
  });
});

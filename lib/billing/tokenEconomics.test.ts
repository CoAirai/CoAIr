import { describe, expect, it } from "vitest";
import {
  CA_MICROS,
  caFromProviderUsd,
  caToMicros,
  chargeUsdForCa,
  effectiveSellRate,
  isNegativeMargin,
  marginForCa,
  microsToCa,
  overageUsdPerCa,
  providerCostUsdForCa,
} from "./tokenEconomics";

describe("CA tokenEconomics", () => {
  it("charges from sell USD per CA", () => {
    expect(chargeUsdForCa(100, 1.2)).toBe(120);
  });

  it("maps provider USD 1:1 to CA at cost rate 1", () => {
    expect(caFromProviderUsd(0.05, 1)).toBeCloseTo(0.05);
  });

  it("computes margin at $1 cost / $1.20 sell", () => {
    const m = marginForCa(100, 1, 1.2);
    expect(m.chargeUsd).toBe(120);
    expect(m.providerCostUsd).toBe(100);
    expect(m.marginUsd).toBe(20);
    expect(m.marginPct).toBeCloseTo(20 / 120);
  });

  it("derives overage per CA", () => {
    expect(overageUsdPerCa(1.2)).toBe(1.2);
  });

  it("flags sell below cost", () => {
    expect(isNegativeMargin(1.2, 1)).toBe(true);
    expect(isNegativeMargin(1, 1.2)).toBe(false);
  });

  it("converts micros", () => {
    expect(caToMicros(42)).toBe(42 * CA_MICROS);
    expect(microsToCa(42 * CA_MICROS)).toBe(42);
  });

  it("uses company override for effective sell rate", () => {
    expect(
      effectiveSellRate({ usdPerCaCost: 1, usdPerCaSell: 1.2 }, 1.5)
    ).toBe(1.5);
  });

  it("provider cost helper", () => {
    expect(providerCostUsdForCa(10, 1)).toBe(10);
  });
});

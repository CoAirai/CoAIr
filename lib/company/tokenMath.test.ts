import { describe, it, expect } from "vitest";
import {
  userAllocation,
  userRemainingInSlice,
  sharesSumTo100,
  equalizeShares,
  releasedUnusedTokens,
} from "./tokenMath";

describe("userAllocation", () => {
  it("floors 25% of 50000", () => {
    expect(userAllocation(50000, 25)).toBe(12500);
  });
});

describe("userRemainingInSlice", () => {
  it("david leftover", () => {
    expect(userRemainingInSlice(12500, 2500, false)).toBe(10000);
  });
  it("released is zero remaining", () => {
    expect(userRemainingInSlice(12500, 2500, true)).toBe(0);
  });
});

describe("sharesSumTo100", () => {
  it("accepts equal 25s", () => {
    expect(sharesSumTo100([25, 25, 25, 25])).toBe(true);
  });
  it("rejects 99", () => {
    expect(sharesSumTo100([25, 25, 25, 24])).toBe(false);
  });
});

describe("equalizeShares", () => {
  it("sums to 100 for 3 users", () => {
    const s = equalizeShares(3);
    expect(s.reduce((a, b) => a + b, 0)).toBe(100);
    expect(s).toHaveLength(3);
  });
});

describe("releasedUnusedTokens", () => {
  it("is allocation minus used", () => {
    expect(releasedUnusedTokens(12500, 2500)).toBe(10000);
  });
});

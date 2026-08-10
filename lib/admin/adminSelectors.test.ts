import { describe, it, expect } from "vitest";
import { isNearStorageLimit, usagePercent } from "./adminSelectors";

describe("isNearStorageLimit", () => {
  it("is true at 80%", () => {
    expect(isNearStorageLimit(80, 100)).toBe(true);
  });
  it("is false below 80%", () => {
    expect(isNearStorageLimit(79, 100)).toBe(false);
  });
  it("is false when limit is 0", () => {
    expect(isNearStorageLimit(10, 0)).toBe(false);
  });
});

describe("usagePercent", () => {
  it("rounds percent", () => {
    expect(usagePercent(1, 3)).toBe(33);
  });
  it("returns 0 when limit is 0", () => {
    expect(usagePercent(10, 0)).toBe(0);
  });
  it("clamps to 100 when over limit", () => {
    expect(usagePercent(150, 100)).toBe(100);
  });
});

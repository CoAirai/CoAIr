import { describe, expect, it } from "vitest";
import { bytesToGb, planLabel, weekWindows } from "./liveHelpers";

describe("liveHelpers", () => {
    it("converts bytes to one-decimal GB", () => {
        expect(bytesToGb(21_474_836_480)).toBe(20);
        expect(bytesToGb(1_610_612_736)).toBe(1.5);
        expect(bytesToGb(undefined)).toBe(0);
    });

    it("labels demo and legacy plans", () => {
        expect(planLabel("demo")).toBe("Demo");
        expect(planLabel("legacy")).toBe("Legacy");
        expect(planLabel("")).toBe("—");
    });

    it("builds eight consecutive week windows ending today", () => {
        const windows = weekWindows(8, new Date("2026-08-14T12:00:00Z"));
        expect(windows).toHaveLength(8);
        expect(windows[0]?.from < windows[7]?.from).toBe(true);
        expect(windows[7]?.to.startsWith("2026-08-14")).toBe(true);
    });
});

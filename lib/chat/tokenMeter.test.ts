import { describe, expect, it } from "vitest";
import { formatTokenCount, getTokenMeter } from "./tokenMeter";

describe("getTokenMeter", () => {
    it("shows remaining percent for an Acme slice", () => {
        const meter = getTokenMeter({
            tokenLimit: 1878,
            tokensUsed: 1280,
            tokenSharePercent: 25,
            personalTokensUsed: 400,
        });

        expect(meter.allocation).toBe(469);
        expect(meter.used).toBe(400);
        expect(meter.remaining).toBe(69);
        expect(meter.remainingPercent).toBe(15);
    });
});

describe("formatTokenCount", () => {
    it("compacts millions like the product chrome", () => {
        expect(formatTokenCount(3_700_000)).toBe("3.7M");
        expect(formatTokenCount(100_000_000)).toBe("100.0M");
    });
});

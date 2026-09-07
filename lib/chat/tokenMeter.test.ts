import { describe, expect, it } from "vitest";
import {
    formatCaCount,
    formatGeminiFromCaMicros,
    formatTokenCount,
    getTokenMeter,
} from "./tokenMeter";

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

describe("formatCaCount", () => {
    it("formats CA micros as CA credits", () => {
        expect(formatCaCount(83_500_000)).toBe("83.5");
        expect(formatCaCount(0)).toBe("0");
    });
});

describe("formatGeminiFromCaMicros", () => {
    it("compacts millions like the old chrome", () => {
        expect(formatGeminiFromCaMicros(3_700_000)).toBe("3.7M");
        expect(formatGeminiFromCaMicros(100_000_000)).toBe("100.0M");
        expect(formatTokenCount(83_500_000)).toBe("83.5M");
    });
});

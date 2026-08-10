import { describe, expect, it } from "vitest";
import { buildChronologyReport } from "./generate";

describe("buildChronologyReport", () => {
    it("builds a ready report with citations from company docs", () => {
        const report = buildChronologyReport({
            topic: "Utility diversion failures",
            startDate: "2006-01-01",
            endDate: "2008-12-31",
            parties: "CEC, MUDFA, SDS",
            nextIndex: 24,
            now: new Date("2026-08-05T10:00:00.000Z"),
            documents: [
                { id: "doc-002", name: "Edinburgh Tram Inquiry extract.pdf" },
                { id: "doc-001", name: "Acme Site Safety Plan.pdf" },
            ],
        });

        expect(report.status).toBe("ready");
        expect(report.reference).toBe("6.24");
        expect(report.title).toContain("Utility diversion");
        expect(report.sections.length).toBeGreaterThan(1);
        expect(report.sources.length).toBeGreaterThan(0);
        expect(report.sections.some((section) => section.citations.length > 0)).toBe(
            true
        );
    });

    it("rejects an empty topic", () => {
        expect(() =>
            buildChronologyReport({
                topic: "  ",
                nextIndex: 1,
                now: new Date(),
                documents: [],
            })
        ).toThrow(/topic/i);
    });
});

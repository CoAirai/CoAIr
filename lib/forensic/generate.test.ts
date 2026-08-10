import { describe, expect, it } from "vitest";
import { buildForensicReport } from "./generate";

describe("buildForensicReport", () => {
    it("builds a ready DCMA report with citations", () => {
        const report = buildForensicReport({
            topic: "Utility diversion programme quality",
            method: "dcma",
            baselineProgramme: "Rev 03 baseline",
            updatedProgramme: "P6 update 42",
            dataDate: "2008-03-01",
            nextIndex: 12,
            now: new Date("2026-08-05T10:00:00.000Z"),
            documents: [
                { id: "doc-tram-001", name: "CEC00246714.pdf" },
                { id: "doc-002", name: "Edinburgh Tram Inquiry extract.pdf" },
            ],
        });

        expect(report.status).toBe("ready");
        expect(report.reference).toBe("7.12");
        expect(report.method).toBe("dcma");
        expect(report.title).toMatch(/DCMA/i);
        expect(report.sections.length).toBeGreaterThan(1);
        expect(report.sources.length).toBeGreaterThan(0);
        expect(report.sections.some((section) => section.citations.length > 0)).toBe(
            true
        );
    });

    it("rejects an empty topic", () => {
        expect(() =>
            buildForensicReport({
                topic: "  ",
                method: "windows",
                nextIndex: 1,
                now: new Date(),
                documents: [],
            })
        ).toThrow(/topic/i);
    });
});

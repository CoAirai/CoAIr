import { describe, expect, it } from "vitest";
import { mapChronologyJob, mapReportStatus } from "./mapChronology";

describe("mapReportStatus", () => {
    it("maps job states onto chronology statuses", () => {
        expect(mapReportStatus("ready")).toBe("ready");
        expect(mapReportStatus("queued")).toBe("generating");
        expect(mapReportStatus("failed")).toBe("failed");
        expect(mapReportStatus("credit_balance_exhausted")).toBe("failed");
    });
});

describe("mapChronologyJob", () => {
    it("shows real API event dates and distinguishes unresolved dates from the overview", () => {
        const report = mapChronologyJob({job_id: "live", status: "ready", result: {
            entries: [
                {entry_ref: "6.2.1", event_type: "overview", event_date: ""},
                {entry_ref: "6.2.2", event_type: "event", event_date: "2026-09-12"},
                {entry_ref: "6.2.3", event_type: "event", event_date: ""},
            ],
        }}, "org");
        expect(report.sections.map(section => section.heading)).toEqual([
            "6.2.1 · Overview", "6.2.2 · 2026-09-12", "6.2.3 · Date not established",
        ]);
    });
    it("turns API entries and evidence into the report UI shape", () => {
        const report = mapChronologyJob(
            {
                job_id: "job-1",
                title: "Utility delay",
                status: "ready",
                created_at: "2026-08-14T08:00:00Z",
                sequence_number: 21,
                result: {
                    evidence: [
                        {
                            source_id: "src_ab",
                            doc_id: "d1",
                            file_name: "Letter.pdf",
                            page: 3,
                        },
                    ],
                    entries: [
                        {
                            date: "2026-01-12",
                            claims: [
                                {
                                    text: "Notice issued.",
                                    source_ids: ["src_ab"],
                                },
                            ],
                        },
                    ],
                },
            },
            "org-1"
        );
        expect(report.id).toBe("job-1");
        expect(report.reference).toBe("21");
        expect(report.sections[0].heading).toBe("2026-01-12");
        expect(report.sections[0].body).toContain("Notice issued.");
        expect(report.sections[0].body).toContain("[src_ab]");
        expect(report.sources[0]).toMatchObject({
            srcId: "src_ab",
            name: "Letter.pdf",
            page: 3,
        });
    });
});

import { describe, expect, it } from "vitest";
import {
    buildChronologyEvents,
    detectDelayBasis,
    formatEventDate,
    inferDocType,
    summarise,
} from "./events";

const evidence = [
    {
        source_id: "src_a",
        doc_id: "d1",
        file_name: "CEC00793598.pdf",
        title: "ETN INFRACO NOTIFICATION of tie CHANGE (INTC)",
        page: 2,
        excerpt: "Notified change",
    },
    {
        source_id: "src_b",
        doc_id: "d2",
        file_name: "TIE00472106.pdf",
        title: "Subject: Correspondence with Richard Bourne",
        page: 1,
        sender: "Samantha Kelly",
        recipient: "Mike Connelly",
        excerpt: "From: Samantha Kelly\nSent: 25 September 2006",
    },
];

describe("buildChronologyEvents", () => {
    it("orders events by date, numbers them, and keeps the overview apart", () => {
        const { overview, events } = buildChronologyEvents(
            [
                {
                    entry_ref: "6.9.1",
                    event_type: "overview",
                    claims: [{ text: "Overall summary.", source_ids: ["src_a"] }],
                },
                {
                    entry_ref: "6.9.3",
                    event_date: "2007-11-25",
                    date_precision: "exact",
                    parties: ["tie limited", "Infraco"],
                    event_type: "Baseline Definition",
                    claims: [
                        {
                            text: "Infraco issued a notice of delay for the Gogar works. A second sentence.",
                            source_ids: ["src_a", "src_b"],
                        },
                    ],
                },
                {
                    entry_ref: "6.9.2",
                    event_date: "2006-05",
                    date_precision: "month",
                    claims: [{ text: "Email about consultation.", source_ids: ["src_b"] }],
                },
                {
                    entry_ref: "6.9.4",
                    event_date: "",
                    date_precision: "unknown",
                    claims: [{ text: "Undated record.", source_ids: [] }],
                },
            ],
            evidence,
            { "6.9.2": { by: "analyst", at: "2026-10-18T10:00:00Z" } }
        );

        expect(overview.map((claim) => claim.text)).toEqual(["Overall summary."]);
        expect(events.map((event) => [event.eventId, event.ref, event.dateLabel])).toEqual([
            ["EV-0001", "6.9.2", "May 2006"],
            ["EV-0002", "6.9.3", "25 Nov 2007"],
            ["EV-0003", "6.9.4", "Date not established"],
        ]);
        const [email, notice] = events;
        expect(email).toMatchObject({
            docType: "Email",
            parties: "Samantha Kelly → Mike Connelly",
            reviewed: true,
            reviewedBy: "analyst",
        });
        expect(notice.docType).toBe("Variation");
        expect(notice.parties).toBe("tie limited, Infraco");
        expect(notice.sources.map((source) => source.srcId)).toEqual(["src_a", "src_b"]);
        expect(notice.sources[0]).toMatchObject({ documentId: "d1", page: 2, pinpoint: "p.2" });
        expect(notice.delay).toMatchObject({ basis: "N", label: "Notice" });
        expect(notice.summary).toBe("Infraco issued a notice of delay for the Gogar works");
        expect(notice.reviewed).toBe(false);
    });
});

describe("helpers", () => {
    it("formats partial dates without timezone drift", () => {
        expect(formatEventDate("2005-09-19", "exact")).toBe("19 Sep 2005");
        expect(formatEventDate("1992-06", "month")).toBe("Jun 1992");
        expect(formatEventDate("1991", "year")).toBe("1991");
        expect(formatEventDate("", "unknown")).toBe("Date not established");
    });

    it("trims summaries and drops a leading date clause", () => {
        expect(summarise("On 12 May 2005, the Board approved the plan. More.")).toBe(
            "The Board approved the plan"
        );
        expect(summarise("x ".repeat(80)).endsWith("…")).toBe(true);
    });

    it("only flags delay wording it can quote", () => {
        expect(detectDelayBasis("The works were suspended pending approval")).toMatchObject({
            basis: "H",
            evidence: "suspended",
        });
        expect(detectDelayBasis("The NCR was closed out on inspection")).toBeNull();
        expect(inferDocType("Minutes of progress meeting 14")).toBe("MINUTES");
    });
});

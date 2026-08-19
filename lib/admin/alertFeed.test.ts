import { describe, expect, it } from "vitest";
import { buildAlertFeed } from "./alertFeed";

describe("buildAlertFeed", () => {
    it("orders access, top-ups, tickets, then past-due invoices", () => {
        const feed = buildAlertFeed({
            pendingAccess: [{ id: "ar-1", companyName: "Northspan" }],
            pendingTopUps: [{ id: "top-1", companyName: "Acme" }],
            openTickets: [{ id: "tkt-1", subject: "Upload stuck" }],
            pastDueInvoices: [{ id: "inv-3", companyName: "Cedar" }],
        });
        expect(feed.map((item) => item.kind)).toEqual([
            "access_request",
            "topup",
            "ticket",
            "past_due",
        ]);
        expect(feed[0].href).toBe("/admin/onboarding");
        expect(feed).toHaveLength(4);
    });
});

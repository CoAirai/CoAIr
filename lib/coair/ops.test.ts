import { describe, expect, it } from "vitest";
import { mapAudit, mapInvoice, mapAnnouncement, mapFeatureFlag, mapTopUpRequest } from "./ops";

describe("mapInvoice", () => {
    it("maps company invoices into the billing page shape", () => {
        expect(
            mapInvoice({
                id: "inv-1",
                company_id: "org-1",
                amount_usd: 100,
                status: "paid",
                issued_at: "2026-08-14",
                due_at: "2026-08-28",
            })
        ).toEqual({
            id: "inv-1",
            companyId: "org-1",
            amountUsd: 100,
            status: "paid",
            issuedAt: "2026-08-14",
            dueAt: "2026-08-28",
        });
    });
});

describe("mapAudit", () => {
    it("maps audit events into the admin log shape", () => {
        expect(
            mapAudit({
                id: "aud-1",
                at: "2026-08-14T08:00:00+00:00",
                actor: "ops",
                action: "billing.refund",
                target_type: "invoice",
                target_id: "inv-1",
                target_label: "inv-1",
                detail: "Refunded $100",
            })
        ).toMatchObject({
            id: "aud-1",
            actor: "ops",
            action: "billing.refund",
            targetType: "invoice",
            targetId: "inv-1",
            targetLabel: "inv-1",
            detail: "Refunded $100",
        });
    });
});

describe("ops mappings", () => {
    it("maps flags, announcements, and top-up requests", () => {
        expect(
            mapFeatureFlag({
                id: "flag-001",
                key: "topups",
                label: "Token Top-ups",
                enabled: true,
            })
        ).toEqual({
            id: "flag-001",
            key: "topups",
            label: "Token Top-ups",
            enabled: true,
        });
        expect(
            mapAnnouncement({
                id: "ann-1",
                title: "Hello",
                body: "World",
                status: "published",
                created_at: "2026-08-14",
                published_at: "2026-08-14",
            })
        ).toMatchObject({
            id: "ann-1",
            title: "Hello",
            status: "published",
            createdAt: "2026-08-14",
            publishedAt: "2026-08-14",
        });
        expect(
            mapTopUpRequest({
                id: "top-1",
                company_id: "org-1",
                tokens_requested: 1000,
                amount_usd: 12.5,
                reason: "Need more",
                status: "pending",
                created_at: "2026-08-14T08:00:00Z",
            })
        ).toMatchObject({
            id: "top-1",
            companyId: "org-1",
            tokensRequested: 1000,
            amountUsd: 12.5,
            status: "pending",
        });
    });
});

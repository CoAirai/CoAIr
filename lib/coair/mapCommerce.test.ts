import { describe, expect, it } from "vitest";
import { mapAccessRequest, mapPlan, mapTicket, mapTokenEconomics } from "./mapCommerce";

describe("mapPlan", () => {
    it("maps package catalog fields for the packages page", () => {
        const plan = mapPlan({
            id: "pro",
            name: "Pro",
            price_label: "Pro · 2026",
            users_included: 12,
            storage_limit_gb: 80,
            api_credits_usd: 100,
            query_cap: 1878,
            modules: {
                chatbot: { access: "included" },
                chronology: { access: "included" },
                forensic: { access: "trial", trial_reports: 2 },
            },
        });
        expect(plan.priceLabel).toBe("Pro · 2026");
        expect(plan.usersIncluded).toBe(12);
        expect(plan.modules.forensic).toEqual({
            access: "trial",
            trialReports: 2,
        });
    });
});

describe("mapTicket", () => {
    it("maps company tickets into the existing ticket shape", () => {
        expect(
            mapTicket({
                id: "tkt-1",
                company_id: "org-1",
                subject: "Upload stuck",
                message: "XER queued",
                priority: "high",
                status: "open",
                assignee_id: "Aisha Khan",
                created_at: "2026-08-14",
            })
        ).toMatchObject({
            id: "tkt-1",
            companyId: "org-1",
            subject: "Upload stuck",
            message: "XER queued",
            priority: "high",
            status: "open",
            assigneeId: "Aisha Khan",
            createdAt: "2026-08-14",
        });
    });
});

describe("mapAccessRequest", () => {
    it("maps the public request queue", () => {
        expect(
            mapAccessRequest({
                id: "ar-1",
                full_name: "Maya Chen",
                email: "maya@northspan.example",
                company_name: "Northspan",
                status: "pending",
                created_at: "2026-08-14T08:00:00+00:00",
            })
        ).toMatchObject({
            id: "ar-1",
            fullName: "Maya Chen",
            email: "maya@northspan.example",
            companyName: "Northspan",
            status: "pending",
        });
    });
});

describe("mapTokenEconomics", () => {
    it("maps sell-rate fields", () => {
        expect(
            mapTokenEconomics({
                provider_tokens_per_usd: 120,
                sell_tokens_per_usd: 90,
                updated_at: "2026-08-14T08:00:00+00:00",
                updated_by: "ops",
            })
        ).toEqual({
            providerTokensPerUsd: 120,
            sellTokensPerUsd: 90,
            updatedAt: "2026-08-14T08:00:00+00:00",
            updatedBy: "ops",
        });
    });
});

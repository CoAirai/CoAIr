import { describe, expect, it } from "vitest";
import { companyForSession } from "./companyForSession";
import type { AuthSession } from "@/lib/auth/resolveLogin";
import type { Company } from "@/lib/admin/types";

const mockCompanies: Company[] = [
    {
        id: "co-001",
        name: "Acme Builders",
        industry: "Construction",
        planId: "pro",
        status: "active",
        usersCount: 4,
        storageLimitGb: 80,
        storageUsedGb: 50,
        tokenLimit: 1878,
        tokensUsed: 1280,
        createdAt: "2025-06-12",
        addOns: ["chronology", "forensic"],
        trialUsage: {},
    },
];

describe("companyForSession", () => {
    it("uses the mock company when the session matches", () => {
        const session: AuthSession = {
            email: "ada@acmebuilders.com",
            name: "Ada",
            role: "company_admin",
            companyId: "co-001",
            userId: "u-001",
        };
        expect(companyForSession(session, mockCompanies)?.id).toBe("co-001");
    });

    it("builds a live company so the hub is not stuck on a skeleton", () => {
        const session: AuthSession = {
            email: "acme-admin",
            name: "Company SuperAdmin",
            role: "company_admin",
            companyId: "3fed7a1b1d0840db",
            userId: "acme-admin",
            source: "live",
            companyName: "Acme Construction",
        };
        const company = companyForSession(session, mockCompanies);
        expect(company?.id).toBe("3fed7a1b1d0840db");
        expect(company?.name).toBe("Acme Construction");
        expect(company?.addOns).toEqual(["chronology", "forensic"]);
        expect(company?.planId).toBe("pro");
    });

    it("synthesizes a company for an unmatched id even if source was not persisted", () => {
        const session: AuthSession = {
            email: "acme-admin",
            name: "Company SuperAdmin",
            role: "company_admin",
            companyId: "3fed7a1b1d0840db",
            userId: "acme-admin",
            companyName: "Acme Construction",
        };
        expect(companyForSession(session, mockCompanies)?.id).toBe(
            "3fed7a1b1d0840db"
        );
    });

    it("synthesizes a company for a live session with no org id yet", () => {
        const session: AuthSession = {
            email: "acme-engineer",
            name: "Engineer",
            role: "member",
            companyId: null,
            userId: "acme-engineer",
            source: "live",
            username: "acme-engineer",
        };
        const company = companyForSession(session, mockCompanies);
        expect(company?.id).toBe("live:acme-engineer");
        expect(company?.planId).toBe("pro");
    });
});

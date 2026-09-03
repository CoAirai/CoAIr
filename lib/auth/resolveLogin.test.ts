import { describe, expect, it } from "vitest";
import { homePathForRole, homePathForSession, resolveLogin } from "./resolveLogin";

const users = [
    {
        id: "u-001",
        email: "ada@acmebuilders.com",
        name: "Ada Lovelace",
        role: "admin",
        status: "active",
        companyId: "co-001",
    },
    {
        id: "u-002",
        email: "ben.carter@acmebuilders.com",
        name: "Ben Carter",
        role: "member",
        status: "active",
        companyId: "co-001",
    },
    {
        id: "u-sus",
        email: "paused@acmebuilders.com",
        name: "Paused User",
        role: "member",
        status: "suspended",
        companyId: "co-001",
    },
];

describe("resolveLogin", () => {
    it("signs in super admin with any non-empty password", () => {
        const result = resolveLogin("admin@coair.ai", "x", users);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.session.role).toBe("super_admin");
            expect(homePathForRole(result.session.role)).toBe("/admin");
        }
    });

    it("signs in company admin", () => {
        const result = resolveLogin("ada@acmebuilders.com", "password", users);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.session.role).toBe("company_admin");
            expect(result.session.companyId).toBe("co-001");
            expect(homePathForRole(result.session.role)).toBe("/company");
        }
    });

    it("signs in members to chat", () => {
        const result = resolveLogin("ben.carter@acmebuilders.com", "password", users);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.session.role).toBe("member");
            expect(homePathForRole(result.session.role)).toBe("/workspace");
        }
    });

    it("rejects empty password and unknown or suspended users", () => {
        expect(resolveLogin("ada@acmebuilders.com", "  ", users).ok).toBe(false);
        expect(resolveLogin("missing@coair.ai", "password", users).ok).toBe(false);
        expect(resolveLogin("paused@acmebuilders.com", "password", users).ok).toBe(
            false
        );
    });
});

describe("homePathForSession", () => {
    it("sends live company admins to the company portal", () => {
        const session = {
            email: "acme-admin",
            name: "Company SuperAdmin",
            role: "company_admin" as const,
            companyId: "org-live",
            userId: "acme-admin",
            source: "live" as const,
        };
        expect(homePathForSession(session)).toBe("/company");
    });

    it("sends live owners who still need a package to checkout", () => {
        const session = {
            email: "maya@northspan.example",
            name: "Maya Chen",
            role: "company_admin" as const,
            companyId: "org-new",
            userId: "maya@northspan.example",
            source: "live" as const,
            needsCheckout: true,
        };
        expect(homePathForSession(session)).toBe("/onboarding/plans");
    });

    it("sends unpaid approved owners to package checkout", () => {
        const session = {
            email: "maya@northspan.example",
            name: "Maya Chen",
            role: "company_admin" as const,
            companyId: "co-new",
            userId: "u-new",
        };
        expect(homePathForSession(session, { needsCheckout: true })).toBe(
            "/onboarding/plans"
        );
        expect(homePathForSession(session, { needsCheckout: false })).toBe(
            "/company"
        );
    });
});

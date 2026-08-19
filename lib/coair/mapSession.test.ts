import { describe, expect, it } from "vitest";
import { mapApiRole, mapLiveSession } from "./mapSession";

describe("mapApiRole", () => {
    it("maps platform operators to super admin", () => {
        expect(mapApiRole("superadmin")).toBe("super_admin");
        expect(mapApiRole("admin")).toBe("super_admin");
    });

    it("maps org owners to company admin", () => {
        expect(mapApiRole("user", "owner")).toBe("company_admin");
    });

    it("maps org members to workspace members", () => {
        expect(mapApiRole("user", "member")).toBe("member");
        expect(mapApiRole("user")).toBe("member");
    });
});

describe("mapLiveSession", () => {
    it("stores the JWT and project on the session", () => {
        const session = mapLiveSession({
            user: {
                username: "acme-admin",
                display_name: "Company SuperAdmin",
                role: "user",
            },
            accessToken: "token",
            org: { org: { org_id: "org-1", name: "Acme" }, role: "owner" },
            projectId: "proj-1",
        });
        expect(session.needsCheckout).toBe(false);
    });

    it("flags approved owners who still need to choose a package", () => {
        const session = mapLiveSession({
            user: {
                username: "maya@northspan.example",
                display_name: "Maya Chen",
                role: "user",
            },
            accessToken: "token",
            org: {
                org: { org_id: "org-new", name: "Northspan" },
                role: "owner",
                subscription: { plan_id: "demo", needs_checkout: true },
            },
        });
        expect(session.needsCheckout).toBe(true);
    });

    it("keeps a workspace company id when GET /org is missing", () => {
        const session = mapLiveSession({
            user: {
                username: "acme-engineer",
                display_name: "Engineer",
                role: "user",
            },
            accessToken: "token",
            org: null,
            projectId: "proj-1",
        });
        expect(session.companyId).toBe("live:acme-engineer");
        expect(session.role).toBe("member");
        expect(session.source).toBe("live");
    });

    it("keeps the impersonating operator on the session", () => {
        const session = mapLiveSession({
            user: {
                username: "engineer",
                display_name: "Engineer",
                role: "user",
            },
            accessToken: "token",
            org: { org: { org_id: "org-1", name: "Acme" }, role: "member" },
            impersonator: "ops",
        });
        expect(session.impersonator).toBe("ops");
        expect(session.role).toBe("member");
    });
});

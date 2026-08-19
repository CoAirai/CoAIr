import { afterEach, describe, expect, it, vi } from "vitest";
import {
    adminOrigin,
    authHref,
    homeUrlForRole,
    homeUrlForSession,
    loginOrigin,
    portalKindFromHost,
    signInUrl,
    subdomainRoutingEnabled,
    userOrigin,
} from "./hosts";
import type { AuthSession } from "./resolveLogin";

describe("portal hosts", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("disables subdomain routing when portal URLs are missing", () => {
        expect(subdomainRoutingEnabled()).toBe(false);
        expect(portalKindFromHost("login.coair.ai")).toBeNull();
    });

    it("disables subdomain routing when all hosts match (local dev)", () => {
        vi.stubEnv("NEXT_PUBLIC_LOGIN_URL", "http://localhost:3002");
        vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "http://localhost:3002");
        vi.stubEnv("NEXT_PUBLIC_USER_URL", "http://localhost:3002");
        expect(subdomainRoutingEnabled()).toBe(false);
        expect(portalKindFromHost("localhost")).toBeNull();
    });

    it("maps production hosts and builds login sign-in URL", () => {
        vi.stubEnv("NEXT_PUBLIC_LOGIN_URL", "https://login.coair.ai");
        vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "https://admin.coair.ai");
        vi.stubEnv("NEXT_PUBLIC_USER_URL", "https://user.coair.ai");
        expect(subdomainRoutingEnabled()).toBe(true);
        expect(portalKindFromHost("login.coair.ai")).toBe("login");
        expect(portalKindFromHost("admin.coair.ai")).toBe("admin");
        expect(portalKindFromHost("user.coair.ai")).toBe("user");
        expect(loginOrigin()).toBe("https://login.coair.ai");
        expect(adminOrigin()).toBe("https://admin.coair.ai");
        expect(userOrigin()).toBe("https://user.coair.ai");
        expect(signInUrl()).toBe("https://login.coair.ai/auth/sign-in");
        expect(authHref("/auth/sign-up")).toBe("https://login.coair.ai/auth/sign-up");
    });

    it("builds role-aware home URLs", () => {
        vi.stubEnv("NEXT_PUBLIC_LOGIN_URL", "https://login.coair.ai");
        vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "https://admin.coair.ai");
        vi.stubEnv("NEXT_PUBLIC_USER_URL", "https://user.coair.ai");
        expect(homeUrlForRole("super_admin")).toBe("https://admin.coair.ai/admin");
        expect(homeUrlForRole("member")).toBe("https://user.coair.ai/workspace");

        const session: AuthSession = {
            email: "owner@acme.com",
            name: "Owner",
            role: "company_admin",
            companyId: "org-1",
            userId: "owner@acme.com",
            source: "live",
        };
        expect(homeUrlForSession(session)).toBe("https://user.coair.ai/workspace");
    });
});

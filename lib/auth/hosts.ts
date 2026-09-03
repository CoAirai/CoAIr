import {
    homePathForRole,
    homePathForSession,
    type AuthSession,
    type SessionRole,
} from "./resolveLogin";

export type PortalKind = "admin" | "user" | "login";

const PROD_LOGIN = "https://login.coair.ai";
const PROD_ADMIN = "https://admin.coair.ai";
const PROD_USER = "https://user.coair.ai";

function normalizeOrigin(value: string): string {
    return value.trim().replace(/\/$/, "");
}

export function hostFromOrigin(origin: string): string {
    try {
        return new URL(origin).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function isCoairProductionHost(host: string): boolean {
    const normalized = host.split(":")[0]?.toLowerCase() ?? "";
    return (
        normalized === "coair.ai" ||
        normalized.endsWith(".coair.ai") ||
        normalized === "login.coair.ai" ||
        normalized === "admin.coair.ai" ||
        normalized === "user.coair.ai"
    );
}

/** When env vars are missing on the client, still route the three live portals. */
function productionDefaults(): {
    login: string;
    admin: string;
    user: string;
} | null {
    if (typeof window !== "undefined") {
        if (isCoairProductionHost(window.location.hostname)) {
            return { login: PROD_LOGIN, admin: PROD_ADMIN, user: PROD_USER };
        }
        return null;
    }
    // Middleware / SSR on Vercel may not have all NEXT_PUBLIC_* at once.
    const login = process.env.NEXT_PUBLIC_LOGIN_URL?.trim();
    const admin = process.env.NEXT_PUBLIC_ADMIN_URL?.trim();
    const user = process.env.NEXT_PUBLIC_USER_URL?.trim();
    if (
        (login && isCoairProductionHost(hostFromOrigin(normalizeOrigin(login)))) ||
        (admin && isCoairProductionHost(hostFromOrigin(normalizeOrigin(admin)))) ||
        (user && isCoairProductionHost(hostFromOrigin(normalizeOrigin(user))))
    ) {
        return { login: PROD_LOGIN, admin: PROD_ADMIN, user: PROD_USER };
    }
    return null;
}

function configuredOrigins(): string[] {
    const defaults = productionDefaults();
    return [
        process.env.NEXT_PUBLIC_ADMIN_URL || defaults?.admin,
        process.env.NEXT_PUBLIC_USER_URL || defaults?.user,
        process.env.NEXT_PUBLIC_LOGIN_URL || defaults?.login,
    ]
        .map((value) => value?.trim())
        .filter(Boolean)
        .map((value) => hostFromOrigin(normalizeOrigin(value!)));
}

export function subdomainRoutingEnabled(): boolean {
    if (typeof window !== "undefined" && isCoairProductionHost(window.location.hostname)) {
        return true;
    }
    const admin =
        process.env.NEXT_PUBLIC_ADMIN_URL?.trim() || productionDefaults()?.admin;
    const user =
        process.env.NEXT_PUBLIC_USER_URL?.trim() || productionDefaults()?.user;
    const login =
        process.env.NEXT_PUBLIC_LOGIN_URL?.trim() || productionDefaults()?.login;
    if (!admin || !user || !login) return false;
    return new Set(configuredOrigins()).size >= 2;
}

export function loginOrigin(): string {
    const configured = process.env.NEXT_PUBLIC_LOGIN_URL?.trim();
    if (configured) return normalizeOrigin(configured);
    const defaults = productionDefaults();
    if (defaults) return defaults.login;
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:3002";
}

export function adminOrigin(): string {
    const configured = process.env.NEXT_PUBLIC_ADMIN_URL?.trim();
    if (configured) return normalizeOrigin(configured);
    const defaults = productionDefaults();
    if (defaults) return defaults.admin;
    if (typeof window !== "undefined") return window.location.origin;
    return "";
}

export function userOrigin(): string {
    const configured =
        process.env.NEXT_PUBLIC_USER_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (configured) return normalizeOrigin(configured);
    const defaults = productionDefaults();
    if (defaults) return defaults.user;
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:3002";
}

export function portalOriginForRole(role: SessionRole): string {
    return role === "super_admin" ? adminOrigin() : userOrigin();
}

export function homeUrlForRole(role: SessionRole): string {
    return `${portalOriginForRole(role)}${homePathForRole(role)}`;
}

export function homeUrlForSession(
    session: AuthSession,
    company?: { needsCheckout?: boolean } | null
): string {
    return `${portalOriginForRole(session.role)}${homePathForSession(session, company)}`;
}

export function portalKindFromHost(
    host: string | null | undefined
): PortalKind | null {
    if (!host) return null;
    const normalized = host.split(":")[0]?.toLowerCase() ?? "";

    // Always recognize the three production hosts even if env is incomplete.
    if (normalized === "login.coair.ai") return "login";
    if (normalized === "admin.coair.ai") return "admin";
    if (normalized === "user.coair.ai") return "user";

    if (!subdomainRoutingEnabled()) return null;
    const loginHost = hostFromOrigin(loginOrigin());
    const adminHost = hostFromOrigin(adminOrigin());
    const userHost = hostFromOrigin(userOrigin());
    if (loginHost && normalized === loginHost) return "login";
    if (adminHost && normalized === adminHost) return "admin";
    if (userHost && normalized === userHost) return "user";
    return null;
}

export function signInUrl(nextPath?: string, signedOut = false): string {
    const base = `${loginOrigin()}/auth/sign-in`;
    const params = new URLSearchParams();
    if (nextPath) params.set("next", nextPath);
    if (signedOut) params.set("signedOut", "1");
    const query = params.toString();
    return query ? `${base}?${query}` : base;
}

/** Auth routes live on login.coair.ai in production; stay relative locally. */
export function authHref(path: string): string {
    if (!subdomainRoutingEnabled() || !path.startsWith("/auth")) {
        return path;
    }
    return `${loginOrigin()}${path}`;
}

export function signInOriginForPortal(_portal: PortalKind): string {
    return loginOrigin();
}

export function signInUrlForPortal(_portal: PortalKind): string {
    return signInUrl();
}

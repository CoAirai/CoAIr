import {
    homePathForRole,
    homePathForSession,
    type AuthSession,
    type SessionRole,
} from "./resolveLogin";

export type PortalKind = "admin" | "user" | "login";

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

function configuredOrigins(): string[] {
    return [
        process.env.NEXT_PUBLIC_ADMIN_URL,
        process.env.NEXT_PUBLIC_USER_URL,
        process.env.NEXT_PUBLIC_LOGIN_URL,
    ]
        .map((value) => value?.trim())
        .filter(Boolean)
        .map((value) => hostFromOrigin(normalizeOrigin(value!)));
}

export function subdomainRoutingEnabled(): boolean {
    const admin = process.env.NEXT_PUBLIC_ADMIN_URL?.trim();
    const user = process.env.NEXT_PUBLIC_USER_URL?.trim();
    const login = process.env.NEXT_PUBLIC_LOGIN_URL?.trim();
    if (!admin || !user || !login) return false;
    return new Set(configuredOrigins()).size >= 2;
}

export function loginOrigin(): string {
    const configured = process.env.NEXT_PUBLIC_LOGIN_URL;
    if (configured) return normalizeOrigin(configured);
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:3002";
}

export function adminOrigin(): string {
    const configured = process.env.NEXT_PUBLIC_ADMIN_URL;
    if (configured) return normalizeOrigin(configured);
    if (typeof window !== "undefined") return window.location.origin;
    return "";
}

export function userOrigin(): string {
    const configured =
        process.env.NEXT_PUBLIC_USER_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (configured) return normalizeOrigin(configured);
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
    if (!subdomainRoutingEnabled() || !host) return null;
    const normalized = host.split(":")[0]?.toLowerCase() ?? "";
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

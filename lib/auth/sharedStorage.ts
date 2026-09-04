const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const ACCESS_TOKEN_KEY = "coair.accessToken";
/** Shared across *.coair.ai so logout on one portal blocks restore on siblings. */
export const SIGNED_OUT_KEY = "coair.signedOut";

function cookieDomain(): string | undefined {
    if (typeof window === "undefined") return undefined;
    const host = window.location.hostname.toLowerCase();
    if (host === "coair.ai" || host.endsWith(".coair.ai")) {
        return ".coair.ai";
    }
    return undefined;
}

function cookieSuffix(): string {
    const domain = cookieDomain();
    const parts = ["path=/", "SameSite=Lax", `max-age=${COOKIE_MAX_AGE}`];
    if (window.location.protocol === "https:") {
        parts.push("Secure");
    }
    if (domain) {
        parts.push(`domain=${domain}`);
    }
    return parts.join("; ");
}

export function readSharedCookie(key: string): string | null {
    if (typeof window === "undefined") return null;
    const match = document.cookie.match(
        new RegExp(`(?:^|; )${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
    );
    if (!match?.[1]) return null;
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

export function readSharedItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    const fromCookie = readSharedCookie(key);
    if (fromCookie !== null) return fromCookie;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

/** Cross-subdomain logout uses the cookie only — ignore orphan localStorage on siblings. */
export function isSharedSignedOut(): boolean {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).get("signedOut") === "1") {
        return true;
    }
    if (readSharedCookie(SIGNED_OUT_KEY) === "1") {
        return true;
    }
    // Scrub stale per-origin copies left after login cleared the shared cookie.
    try {
        localStorage.removeItem(SIGNED_OUT_KEY);
    } catch {
        /* ignore */
    }
    try {
        sessionStorage.removeItem(SIGNED_OUT_KEY);
    } catch {
        /* ignore */
    }
    return false;
}

export function writeSharedItem(key: string, value: string, cookie = true): void {
    if (typeof window === "undefined") return;
    if (cookie && value.length < 3500) {
        document.cookie = `${key}=${encodeURIComponent(value)}; ${cookieSuffix()}`;
    }
    try {
        localStorage.setItem(key, value);
    } catch {
        /* ignore quota */
    }
}

function expireCookie(key: string, domain?: string): void {
    const parts = ["path=/", "max-age=0", "SameSite=Lax"];
    if (typeof window !== "undefined" && window.location.protocol === "https:") {
        parts.push("Secure");
    }
    if (domain) {
        parts.push(`domain=${domain}`);
    }
    document.cookie = `${key}=; ${parts.join("; ")}`;
}

export function removeSharedItem(key: string): void {
    if (typeof window === "undefined") return;
    expireCookie(key);
    const domain = cookieDomain();
    if (domain) {
        expireCookie(key, domain);
    }
    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}

export function clearSharedAuth(): void {
    if (typeof window === "undefined") return;
    const names = document.cookie
        .split(";")
        .map((part) => part.split("=")[0]?.trim())
        .filter(Boolean);
    for (const name of names) {
        if (name === SIGNED_OUT_KEY) continue;
        // Keep pending MFA challenge across a pre-code signOut.
        if (name === "coair.mfaChallenge") continue;
        if (name.startsWith("coair.") || name.startsWith("sb-")) {
            removeSharedItem(name);
        }
    }
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (
                key &&
                key !== SIGNED_OUT_KEY &&
                key !== "coair.mfaChallenge" &&
                (key.startsWith("coair.") || key.startsWith("sb-"))
            ) {
                keys.push(key);
            }
        }
        keys.forEach((key) => localStorage.removeItem(key));
    } catch {
        /* ignore */
    }
}

export const sharedWebStorage = {
    getItem: (key: string) => readSharedItem(key),
    setItem: (key: string, value: string) => writeSharedItem(key, value),
    removeItem: (key: string) => removeSharedItem(key),
};

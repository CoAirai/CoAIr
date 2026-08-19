const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

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

export function readSharedItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    const match = document.cookie.match(
        new RegExp(`(?:^|; )${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
    );
    if (match?.[1]) {
        try {
            return decodeURIComponent(match[1]);
        } catch {
            return match[1];
        }
    }
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeSharedItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    document.cookie = `${key}=${encodeURIComponent(value)}; ${cookieSuffix()}`;
    try {
        localStorage.setItem(key, value);
    } catch {
        /* ignore quota */
    }
}

export function removeSharedItem(key: string): void {
    if (typeof window === "undefined") return;
    const domain = cookieDomain();
    document.cookie = `${key}=; path=/; max-age=0`;
    if (domain) {
        document.cookie = `${key}=; path=/; domain=${domain}; max-age=0`;
    }
    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}

export const sharedWebStorage = {
    getItem: (key: string) => readSharedItem(key),
    setItem: (key: string, value: string) => writeSharedItem(key, value),
    removeItem: (key: string) => removeSharedItem(key),
};

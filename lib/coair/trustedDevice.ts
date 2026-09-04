const DEVICE_PREFIX = "coair.trustedDevice:";

export function readTrustedDeviceToken(username: string): string | null {
    if (typeof window === "undefined") return null;
    const key = DEVICE_PREFIX + username.trim().toLowerCase();
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeTrustedDeviceToken(
    username: string,
    token: string
): void {
    if (typeof window === "undefined") return;
    const key = DEVICE_PREFIX + username.trim().toLowerCase();
    try {
        localStorage.setItem(key, token);
    } catch {
        /* ignore */
    }
}

export function clearTrustedDeviceToken(username: string): void {
    if (typeof window === "undefined") return;
    const key = DEVICE_PREFIX + username.trim().toLowerCase();
    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}

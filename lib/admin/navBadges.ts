export type AdminBadgeKey =
    | "packages"
    | "topups"
    | "onboarding"
    | "tickets";

const STORAGE_PREFIX = "coair.admin.badgeSeen.";

type SeenState = {
    ids: string[];
    at: string;
};

function storageKey(key: AdminBadgeKey) {
    return `${STORAGE_PREFIX}${key}`;
}

export function readSeenIds(key: AdminBadgeKey): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = window.localStorage.getItem(storageKey(key));
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as SeenState;
        return new Set(Array.isArray(parsed.ids) ? parsed.ids.map(String) : []);
    } catch {
        return new Set();
    }
}

export function markBadgeSeen(key: AdminBadgeKey, ids: string[]) {
    if (typeof window === "undefined") return;
    const unique = Array.from(new Set(ids.map(String)));
    const payload: SeenState = {
        ids: unique,
        at: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey(key), JSON.stringify(payload));
}

export function unseenBadgeCount(key: AdminBadgeKey, pendingIds: string[]) {
    const seen = readSeenIds(key);
    return pendingIds.filter((id) => !seen.has(String(id))).length;
}

export const ADMIN_BADGE_BY_HREF: Record<string, AdminBadgeKey> = {
    "/admin/packages": "packages",
    "/admin/topups": "topups",
    "/admin/onboarding": "onboarding",
    "/admin/tickets": "tickets",
};

"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
    ADMIN_BADGE_BY_HREF,
    markBadgeSeen,
    unseenBadgeCount,
    type AdminBadgeKey,
} from "@/lib/admin/navBadges";
import { listAccessRequests, listAdminTickets } from "@/lib/coair/commerce";
import {
    listAdminModuleUnlockRequests,
    listAdminPackageChangeRequests,
    listAdminTopups,
} from "@/lib/coair/ops";

type BadgeCounts = Record<AdminBadgeKey, number>;

type AdminBadgesValue = {
    counts: BadgeCounts;
    refresh: () => Promise<void>;
    pendingIds: Record<AdminBadgeKey, string[]>;
};

const EMPTY: BadgeCounts = {
    packages: 0,
    topups: 0,
    onboarding: 0,
    tickets: 0,
};

const EMPTY_IDS: Record<AdminBadgeKey, string[]> = {
    packages: [],
    topups: [],
    onboarding: [],
    tickets: [],
};

const AdminBadgesContext = createContext<AdminBadgesValue | null>(null);

async function loadPendingIds(token: string): Promise<Record<AdminBadgeKey, string[]>> {
    const [unlocks, changes, topups, access, tickets] = await Promise.all([
        listAdminModuleUnlockRequests(token, "pending").catch(() => []),
        listAdminPackageChangeRequests(token, "pending").catch(() => []),
        listAdminTopups(token).catch(() => []),
        listAccessRequests(token).catch(() => []),
        listAdminTickets(token).catch(() => []),
    ]);

    return {
        packages: [
            ...unlocks.map((row) => row.id),
            ...changes.map((row) => row.id),
        ],
        topups: topups
            .filter((row) => row.status === "pending")
            .map((row) => row.id),
        onboarding: access
            .filter((row) => row.status === "pending")
            .map((row) => row.id),
        tickets: tickets
            .filter((row) => row.status === "open")
            .map((row) => row.id),
    };
}

function toCounts(pending: Record<AdminBadgeKey, string[]>): BadgeCounts {
    return {
        packages: unseenBadgeCount("packages", pending.packages),
        topups: unseenBadgeCount("topups", pending.topups),
        onboarding: unseenBadgeCount("onboarding", pending.onboarding),
        tickets: unseenBadgeCount("tickets", pending.tickets),
    };
}

export function AdminBadgesProvider({ children }: { children: ReactNode }) {
    const { session } = useAuth();
    const pathname = usePathname();
    const token =
        session?.role === "super_admin" ? session.accessToken ?? "" : "";
    const [pendingIds, setPendingIds] =
        useState<Record<AdminBadgeKey, string[]>>(EMPTY_IDS);
    const [counts, setCounts] = useState<BadgeCounts>(EMPTY);

    const refresh = useCallback(async () => {
        if (!token) {
            setPendingIds(EMPTY_IDS);
            setCounts(EMPTY);
            return;
        }
        const next = await loadPendingIds(token);
        setPendingIds(next);
        setCounts(toCounts(next));
    }, [token]);

    useEffect(() => {
        void refresh();
        if (!token) return;
        const timer = window.setInterval(() => {
            void refresh();
        }, 60_000);
        return () => window.clearInterval(timer);
    }, [refresh, token]);

    useEffect(() => {
        const key = ADMIN_BADGE_BY_HREF[pathname];
        if (!key) return;
        const ids = pendingIds[key];
        markBadgeSeen(key, ids);
        setCounts((prev) => ({ ...prev, [key]: 0 }));
    }, [pathname, pendingIds]);

    const value = useMemo(
        () => ({ counts, refresh, pendingIds }),
        [counts, pendingIds, refresh]
    );

    return (
        <AdminBadgesContext.Provider value={value}>
            {children}
        </AdminBadgesContext.Provider>
    );
}

export function useAdminBadges() {
    const ctx = useContext(AdminBadgesContext);
    if (!ctx) {
        return {
            counts: EMPTY,
            refresh: async () => undefined,
            pendingIds: EMPTY_IDS,
        };
    }
    return ctx;
}

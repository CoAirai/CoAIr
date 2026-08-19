"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    listAdminOrgs,
    listAdminUsage,
    listAdminUsers,
    readPlatformUsage,
    setAdminUserActive,
    type CoairAdminOrg,
    type CoairAdminUser,
    type CoairBillingGroup,
    type CoairUsageSnapshot,
} from "@/lib/coair/admin";

type LiveAdminCache = {
    token: string;
    orgs: CoairAdminOrg[];
    users: CoairAdminUser[];
    usage: CoairUsageSnapshot | null;
    groups: CoairBillingGroup[];
};

let liveAdminCache: LiveAdminCache | null = null;
let liveAdminRefresh: Promise<void> | null = null;

const cacheForToken = (token?: string | null) =>
    token && liveAdminCache?.token === token ? liveAdminCache : null;

async function refreshLiveAdminCache(token: string) {
    if (liveAdminRefresh) {
        await liveAdminRefresh;
        if (cacheForToken(token)) {
            return liveAdminCache!;
        }
    }
    liveAdminRefresh = (async () => {
        async function settled<T>(fn: () => Promise<T>) {
            try {
                return { status: "fulfilled" as const, value: await fn() };
            } catch (reason) {
                return { status: "rejected" as const, reason };
            }
        }

        const orgList = await settled(() => listAdminOrgs(token));
        await new Promise((resolve) => setTimeout(resolve, 300));
        const userList = await settled(() => listAdminUsers(token));
        await new Promise((resolve) => setTimeout(resolve, 300));
        const snapshot = await settled(() => readPlatformUsage(token));
        await new Promise((resolve) => setTimeout(resolve, 300));
        const billing = await settled(() => listAdminUsage(token));
        const failures: string[] = [];
        const nextOrgs =
            orgList.status === "fulfilled"
                ? (orgList.value.orgs ?? [])
                : liveAdminCache?.orgs ?? [];
        const nextUsers =
            userList.status === "fulfilled"
                ? (userList.value.users ?? [])
                : liveAdminCache?.users ?? [];
        const nextUsage =
            snapshot.status === "fulfilled"
                ? snapshot.value
                : liveAdminCache?.usage ?? null;
        const nextGroups =
            billing.status === "fulfilled"
                ? (billing.value.groups ?? [])
                : liveAdminCache?.groups ?? [];
        if (orgList.status === "rejected") {
            failures.push(
                orgList.reason instanceof Error
                    ? orgList.reason.message
                    : "Unable to load companies"
            );
        }
        if (userList.status === "rejected") {
            failures.push(
                userList.reason instanceof Error
                    ? userList.reason.message
                    : "Unable to load users"
            );
        }
        liveAdminCache = {
            token,
            orgs: nextOrgs,
            users: nextUsers,
            usage: nextUsage,
            groups: nextGroups,
        };
        if (failures.length) {
            throw new Error(failures[0]);
        }
    })();
    try {
        await liveAdminRefresh;
    } finally {
        liveAdminRefresh = null;
    }
    return liveAdminCache!;
}

export function getLiveAdminCache(token?: string | null) {
    return cacheForToken(token);
}

export function useLiveAdmin() {
    const { session } = useAuth();
    const accessToken = session?.accessToken ?? "";
    const enabled =
        session?.source === "live" &&
        Boolean(accessToken) &&
        session.role === "super_admin";
    const cached = cacheForToken(accessToken);
    const [orgs, setOrgs] = useState<CoairAdminOrg[]>(() => cached?.orgs ?? []);
    const [users, setUsers] = useState<CoairAdminUser[]>(
        () => cached?.users ?? []
    );
    const [usage, setUsage] = useState<CoairUsageSnapshot | null>(
        () => cached?.usage ?? null
    );
    const [groups, setGroups] = useState<CoairBillingGroup[]>(
        () => cached?.groups ?? []
    );
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(!cached);

    const refresh = useCallback(async () => {
        if (!enabled || !session?.accessToken) {
            liveAdminCache = null;
            setOrgs([]);
            setUsers([]);
            setUsage(null);
            setGroups([]);
            setLoading(false);
            return;
        }
        const token = session.accessToken;
        if (liveAdminCache && liveAdminCache.token !== token) {
            liveAdminCache = null;
            setOrgs([]);
            setUsers([]);
            setUsage(null);
            setGroups([]);
        }
        if (!cacheForToken(token)) {
            setLoading(true);
        }
        setError(null);
        try {
            await refreshLiveAdminCache(token);
            const hit = cacheForToken(token);
            if (hit) {
                setOrgs(hit.orgs);
                setUsers(hit.users);
                setUsage(hit.usage);
                setGroups(hit.groups);
            }
        } catch (err) {
            const hit = cacheForToken(token);
            if (hit) {
                setOrgs(hit.orgs);
                setUsers(hit.users);
                setUsage(hit.usage);
                setGroups(hit.groups);
            }
            setError(err instanceof Error ? err.message : "Unable to load admin data");
        } finally {
            setLoading(false);
        }
    }, [enabled, session?.accessToken]);

    useEffect(() => {
        const hit = cacheForToken(accessToken);
        if (hit) {
            setOrgs(hit.orgs);
            setUsers(hit.users);
            setUsage(hit.usage);
            setGroups(hit.groups);
            setLoading(false);
        }
        void refresh();
    }, [accessToken, refresh]);

    const setActive = useCallback(
        async (username: string, isActive: boolean) => {
            if (!session?.accessToken) {
                return { ok: false as const, error: "Not signed in" };
            }
            try {
                await setAdminUserActive(session.accessToken, username, isActive);
                await refresh();
                return { ok: true as const };
            } catch (err) {
                return {
                    ok: false as const,
                    error: err instanceof Error ? err.message : "Update failed",
                };
            }
        },
        [refresh, session?.accessToken]
    );

    return {
        enabled,
        loading,
        error,
        orgs,
        users,
        usage,
        groups,
        refresh,
        setActive,
    };
}

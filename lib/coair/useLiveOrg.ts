"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    createOrgUser,
    deactivateOrgUser,
    listOrgUsers,
    readAuthMe,
    readOrg,
    readOrgUsage,
    type CoairOrgUsage,
    type CoairOrgUser,
} from "@/lib/coair/org";
import type { CoairOrgResponse } from "@/lib/coair/types";

export function useLiveOrg() {
    const { session } = useAuth();
    const enabled =
        session?.source === "live" &&
        Boolean(session.accessToken) &&
        session.role === "company_admin";
    const [users, setUsers] = useState<CoairOrgUser[]>([]);
    const [org, setOrg] = useState<CoairOrgResponse | null>(null);
    const [orgUsage, setOrgUsage] = useState<CoairOrgUsage | null>(null);
    const [me, setMe] = useState<Awaited<ReturnType<typeof readAuthMe>>["user"] | null>(
        null
    );
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!enabled || !session?.accessToken) {
            setUsers([]);
            setOrg(null);
            setOrgUsage(null);
            setMe(null);
            return;
        }
        setLoading(true);
        setError(null);
        const token = session.accessToken;
        try {
            const [orgResult, usersResult, meResult, usageResult] =
                await Promise.allSettled([
                    readOrg(token),
                    listOrgUsers(token),
                    readAuthMe(token),
                    readOrgUsage(token),
                ]);
            const failures: string[] = [];
            if (orgResult.status === "fulfilled") {
                setOrg(orgResult.value);
            } else {
                setOrg(null);
                failures.push(
                    orgResult.reason instanceof Error
                        ? orgResult.reason.message
                        : "Unable to load company"
                );
            }
            if (usersResult.status === "fulfilled") {
                setUsers(usersResult.value.users ?? []);
            } else {
                setUsers([]);
                failures.push(
                    usersResult.reason instanceof Error
                        ? usersResult.reason.message
                        : "Unable to load team"
                );
            }
            if (meResult.status === "fulfilled") {
                setMe(meResult.value.user);
            } else {
                setMe(null);
            }
            if (usageResult.status === "fulfilled") {
                setOrgUsage(usageResult.value);
            } else {
                setOrgUsage(null);
            }
            setError(failures[0] ?? null);
        } finally {
            setLoading(false);
        }
    }, [enabled, session?.accessToken]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const addUser = useCallback(
        async (input: {
            username: string;
            password?: string;
            display_name?: string;
        }) => {
            if (!session?.accessToken) {
                return { ok: false as const, error: "Not signed in" };
            }
            try {
                await createOrgUser(session.accessToken, input);
                await refresh();
                return { ok: true as const };
            } catch (err) {
                return {
                    ok: false as const,
                    error: err instanceof Error ? err.message : "Create failed",
                };
            }
        },
        [refresh, session?.accessToken]
    );

    const deactivate = useCallback(
        async (username: string) => {
            if (!session?.accessToken) {
                return { ok: false as const, error: "Not signed in" };
            }
            try {
                await deactivateOrgUser(session.accessToken, username);
                await refresh();
                return { ok: true as const };
            } catch (err) {
                return {
                    ok: false as const,
                    error: err instanceof Error ? err.message : "Deactivate failed",
                };
            }
        },
        [refresh, session?.accessToken]
    );

    return {
        enabled,
        loading,
        error,
        users,
        org,
        orgUsage,
        me,
        refresh,
        addUser,
        deactivate,
    };
}

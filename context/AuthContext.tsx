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
import { useAdminData } from "@/context/AdminDataContext";
import { useToast } from "@/context/ToastContext";
import {
    AUTH_SESSION_KEY,
    ADMIN_BACKUP_KEY,
    type AuthSession,
    resolveLogin,
} from "@/lib/auth/resolveLogin";
import { CoairApiError } from "@/lib/coair/client";
import {
    tryLiveLogin,
    sessionFromLiveToken,
    hydrateSharedSupabaseSession,
} from "@/lib/coair/liveLogin";
import { portalKindFromHost } from "@/lib/auth/hosts";
import {
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    SIGNED_OUT_KEY,
    clearSharedAuth,
    isSharedSignedOut,
    readSharedItem,
    removeSharedItem,
    writeSharedItem,
} from "@/lib/auth/sharedStorage";
import {
    authEmailFromUsername,
    getSupabaseBrowser,
    isInviteOrRecoveryCallback,
    isSupabaseAuthConfigured,
    shouldDeferAppSession,
} from "@/lib/supabase/browser";

type SignInResult =
    | { ok: true; session: AuthSession }
    | {
          ok: false;
          mfa: true;
          mfaToken: string;
          debugCode?: string;
          username: string;
      }
    | { ok: false; mfa?: false; error: string };

type AuthContextValue = {
    session: AuthSession | null;
    ready: boolean;
    signIn: (email: string, password: string) => Promise<SignInResult>;
    applySession: (session: AuthSession) => void;
    signOut: () => Promise<void>;
    updateSession: (patch: Partial<AuthSession>) => void;
    changePassword: (
        current: string,
        next: string
    ) => Promise<{ ok: boolean; error?: string }>;
};

function isSignedOutFlag(): boolean {
    return isSharedSignedOut();
}

function markSignedOut(): void {
    writeSharedItem(SIGNED_OUT_KEY, "1", true);
    sessionStorage.setItem(SIGNED_OUT_KEY, "1");
}

function clearSignedOutFlag(): void {
    removeSharedItem(SIGNED_OUT_KEY);
    sessionStorage.removeItem(SIGNED_OUT_KEY);
}

/** Workspace login must not adopt platform-admin sessions (separate admin portal). */
function shouldIgnoreSessionOnThisPortal(session: AuthSession): boolean {
    if (typeof window === "undefined") return false;
    const portal = portalKindFromHost(window.location.host);
    return portal === "login" && session.role === "super_admin";
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persist(session: AuthSession | null, options?: { wipeAll?: boolean }) {
    if (typeof window === "undefined") {
        return;
    }
    if (!session) {
        removeSharedItem(AUTH_SESSION_KEY);
        removeSharedItem(ACCESS_TOKEN_KEY);
        removeSharedItem(REFRESH_TOKEN_KEY);
        // Full wipe (including Supabase refresh material) only on intentional logout.
        // Trusted-device keys are preserved inside clearSharedAuth.
        if (options?.wipeAll !== false) {
            clearSharedAuth();
        }
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        return;
    }
    const raw = JSON.stringify(session);
    writeSharedItem(AUTH_SESSION_KEY, raw, raw.length < 3500);
    if (session.accessToken) {
        writeSharedItem(ACCESS_TOKEN_KEY, session.accessToken, true);
    }
    sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function readStoredSession(): AuthSession | null {
    if (typeof window === "undefined") {
        return null;
    }
    const raw =
        readSharedItem(AUTH_SESSION_KEY) ||
        sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw) as AuthSession;
    } catch {
        removeSharedItem(AUTH_SESSION_KEY);
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        return null;
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const { users } = useAdminData();
    const { pushToast } = useToast();
    const [session, setSession] = useState<AuthSession | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function adoptToken(token: string, allowRefresh = true) {
            try {
                const live = await sessionFromLiveToken(token);
                if (cancelled) return;
                if (shouldIgnoreSessionOnThisPortal(live)) {
                    // Keep shared cookies for admin.coair.ai; stay logged-out on login portal.
                    setSession(null);
                    return;
                }
                persist(live);
                setSession(live);
            } catch (error) {
                const unauthorized =
                    error instanceof CoairApiError && error.status === 401;
                if (unauthorized) {
                    if (allowRefresh && !isSignedOutFlag()) {
                        const supabase = getSupabaseBrowser();
                        if (supabase) {
                            try {
                                await hydrateSharedSupabaseSession();
                                const { data, error: refreshError } =
                                    await supabase.auth.refreshSession();
                                const next =
                                    data.session?.access_token?.trim() || "";
                                if (data.session?.refresh_token) {
                                    writeSharedItem(
                                        REFRESH_TOKEN_KEY,
                                        data.session.refresh_token,
                                        true
                                    );
                                }
                                if (!refreshError && next && next !== token) {
                                    await adoptToken(next, false);
                                    return;
                                }
                            } catch {
                                /* fall through to soft clear */
                            }
                        }
                    }
                    // Soft clear app session only — do not wipe Supabase refresh tokens
                    // unless the user explicitly signed out (avoids logout↔login flicker).
                    if (isSignedOutFlag()) {
                        persist(null);
                    } else {
                        persist(null, { wipeAll: false });
                    }
                    if (!cancelled) setSession(null);
                    return;
                }
                const stored = readStoredSession();
                if (!cancelled && stored && !shouldIgnoreSessionOnThisPortal(stored)) {
                    setSession(stored);
                }
            }
        }

        function patchToken(token: string) {
            setSession((prev) => {
                const base = prev ?? readStoredSession();
                if (!base) {
                    void adoptToken(token);
                    return prev;
                }
                if (shouldIgnoreSessionOnThisPortal(base)) {
                    return null;
                }
                const updated = { ...base, accessToken: token };
                persist(updated);
                return updated;
            });
        }

        async function restore() {
            try {
                if (shouldDeferAppSession()) {
                    if (
                        !window.location.pathname.startsWith("/auth/reset-password") &&
                        isInviteOrRecoveryCallback()
                    ) {
                        window.location.replace(
                            `/auth/reset-password${window.location.hash}${window.location.search}`
                        );
                        return;
                    }
                    if (!cancelled) {
                        setReady(true);
                    }
                    return;
                }

                if (isSignedOutFlag()) {
                    persist(null);
                    // Keep the shared signed-out marker so sibling portals don't revive.
                    markSignedOut();
                    await getSupabaseBrowser()?.auth.signOut({ scope: "local" });
                    if (!cancelled) {
                        setSession(null);
                        setReady(true);
                    }
                    return;
                }

                // Cross-subdomain: hydrate Supabase from shared refresh cookie
                // before reading local sb-* (which is origin-scoped).
                const hydrated = await hydrateSharedSupabaseSession();

                const stored = readStoredSession();
                if (stored && !cancelled) {
                    if (shouldIgnoreSessionOnThisPortal(stored)) {
                        setSession(null);
                    } else {
                        setSession(stored);
                        setReady(true);
                    }
                }

                const supabase = getSupabaseBrowser();
                const token =
                    hydrated ||
                    readSharedItem(ACCESS_TOKEN_KEY) ||
                    (supabase
                        ? (await supabase.auth.getSession()).data.session?.access_token
                        : null) ||
                    stored?.accessToken;
                if (token) {
                    await adoptToken(token);
                }
            } catch {
                /* keep whatever session we already restored */
            }
            if (!cancelled) {
                setReady(true);
            }
        }

        void restore();

        const supabase = getSupabaseBrowser();
        const { data } = supabase?.auth.onAuthStateChange(async (event, next) => {
            if (event === "PASSWORD_RECOVERY") {
                return;
            }
            if (event === "SIGNED_OUT") {
                // Intentional logout (user clicked Sign out) — wipe everything.
                if (isSharedSignedOut()) {
                    persist(null);
                    markSignedOut();
                    setSession(null);
                    return;
                }
                // Incidental SIGNED_OUT (multi-tab refresh race / storage glitch /
                // background tab): recover quietly — never flash logout UI.
                const sharedRefresh = readSharedItem(REFRESH_TOKEN_KEY)?.trim();
                const sharedAccess = readSharedItem(ACCESS_TOKEN_KEY)?.trim();
                if (sharedAccess && sharedRefresh && !isSignedOutFlag()) {
                    try {
                        await hydrateSharedSupabaseSession();
                        const recovered =
                            await getSupabaseBrowser()?.auth.getSession();
                        const token =
                            recovered?.data.session?.access_token ||
                            sharedAccess;
                        if (token) {
                            patchToken(token);
                            return;
                        }
                    } catch {
                        /* fall through */
                    }
                }
                const recovered = await getSupabaseBrowser()?.auth.getSession();
                const token = recovered?.data.session?.access_token;
                if (token && !isSignedOutFlag()) {
                    patchToken(token);
                    return;
                }
                // Keep the last known app session on screen; a later
                // TOKEN_REFRESHED / visibility restore can heal without flicker.
                const kept = readStoredSession();
                if (kept && !shouldIgnoreSessionOnThisPortal(kept)) {
                    return;
                }
                setSession(null);
                return;
            }
            if (next?.access_token) {
                if (isSignedOutFlag()) {
                    return;
                }
                if (next.refresh_token) {
                    writeSharedItem(REFRESH_TOKEN_KEY, next.refresh_token, true);
                }
                writeSharedItem(ACCESS_TOKEN_KEY, next.access_token, true);
                patchToken(next.access_token);
            }
        }) ?? { data: { subscription: { unsubscribe() {} } } };

        const onVisible = () => {
            if (document.visibilityState !== "visible" || isSignedOutFlag()) {
                return;
            }
            void hydrateSharedSupabaseSession().then((token) => {
                if (token && !cancelled) {
                    void adoptToken(token);
                }
            });
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            cancelled = true;
            data.subscription.unsubscribe();
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    const signIn = useCallback(
        async (email: string, password: string): Promise<SignInResult> => {
            const live = await tryLiveLogin(email, password);
            if (live.ok) {
                clearSignedOutFlag();
                persist(live.session);
                setSession(live.session);
                pushToast(`Signed in as ${live.session.name || email}`, "success");
                return live;
            }
            if (live.kind === "mfa") {
                return {
                    ok: false,
                    mfa: true,
                    mfaToken: live.mfaToken,
                    debugCode: live.debugCode,
                    username: live.username,
                };
            }

            if (live.kind === "unreachable") {
                return {
                    ok: false,
                    error: live.error,
                };
            }
            if (!isSupabaseAuthConfigured()) {
                const mock = resolveLogin(email, password, users);
                if (mock.ok) {
                    clearSignedOutFlag();
                    persist(mock.session);
                    setSession(mock.session);
                    pushToast(
                        `Signed in as ${mock.session.name || email}`,
                        "success"
                    );
                    return mock;
                }
            }
            return { ok: false, error: live.error };
        },
        [pushToast, users]
    );

    const applySession = useCallback(
        (next: AuthSession) => {
            clearSignedOutFlag();
            persist(next);
            setSession(next);
            pushToast(`Signed in as ${next.name || next.email}`, "success");
        },
        [pushToast]
    );

    const signOut = useCallback(async () => {
        persist(null);
        sessionStorage.removeItem(ADMIN_BACKUP_KEY);
        markSignedOut();
        setSession(null);
        const supabase = getSupabaseBrowser();
        if (supabase) {
            await supabase.auth.signOut({ scope: "local" });
        }
        persist(null);
        // persist(null) must not wipe the shared logout marker.
        markSignedOut();
        pushToast("Signed out", "info");
    }, [pushToast]);

    const updateSession = useCallback((patch: Partial<AuthSession>) => {
        setSession((prev) => {
            if (!prev) return prev;
            const next = { ...prev, ...patch };
            persist(next);
            return next;
        });
    }, []);

    const changePassword = useCallback(
        async (current: string, next: string) => {
            if (!session) {
                return { ok: false, error: "Not signed in" };
            }
            if (!current.trim()) {
                return { ok: false, error: "Current password required" };
            }
            if (next.length < 8) {
                return {
                    ok: false,
                    error: "New password must be at least 8 characters",
                };
            }
            const supabase = getSupabaseBrowser();
            if (supabase && session.source === "live") {
                const email =
                    session.email?.includes("@")
                        ? session.email
                        : authEmailFromUsername(session.username || session.email);
                const { error: signError } = await supabase.auth.signInWithPassword({
                    email,
                    password: current,
                });
                if (signError) {
                    return { ok: false, error: "Current password is incorrect" };
                }
                const { error: updateError } = await supabase.auth.updateUser({
                    password: next,
                });
                if (updateError) {
                    return { ok: false, error: updateError.message };
                }
                return { ok: true };
            }
            return { ok: true };
        },
        [session]
    );

    const value = useMemo(
        () => ({
            session,
            ready,
            signIn,
            applySession,
            signOut,
            updateSession,
            changePassword,
        }),
        [session, ready, signIn, applySession, signOut, updateSession, changePassword]
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return ctx;
}

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
import {
    AUTH_SESSION_KEY,
    ADMIN_BACKUP_KEY,
    type AuthSession,
    resolveLogin,
} from "@/lib/auth/resolveLogin";
import { tryLiveLogin, sessionFromLiveToken } from "@/lib/coair/liveLogin";
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
    signOut: () => void;
    updateSession: (patch: Partial<AuthSession>) => void;
    changePassword: (
        current: string,
        next: string
    ) => Promise<{ ok: boolean; error?: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function persist(session: AuthSession | null) {
    if (typeof window === "undefined") {
        return;
    }
    if (!session) {
        localStorage.removeItem(AUTH_SESSION_KEY);
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        return;
    }
    const raw = JSON.stringify(session);
    localStorage.setItem(AUTH_SESSION_KEY, raw);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function readStoredSession(): AuthSession | null {
    if (typeof window === "undefined") {
        return null;
    }
    const raw =
        localStorage.getItem(AUTH_SESSION_KEY) ||
        sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw) as AuthSession;
    } catch {
        localStorage.removeItem(AUTH_SESSION_KEY);
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        return null;
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const { users } = useAdminData();
    const [session, setSession] = useState<AuthSession | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let ignoreSignOut = true;

        async function adoptToken(token: string, fallback: AuthSession | null) {
            try {
                const live = await sessionFromLiveToken(token);
                if (!cancelled) {
                    persist(live);
                    setSession(live);
                }
            } catch {
                if (!cancelled && fallback) {
                    const kept = { ...fallback, accessToken: token };
                    persist(kept);
                    setSession(kept);
                }
            }
        }

        function patchToken(token: string) {
            setSession((prev) => {
                const base = prev ?? readStoredSession();
                if (!base) {
                    void adoptToken(token, null);
                    return prev;
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

                const stored = readStoredSession();
                if (stored && !cancelled) {
                    setSession(stored);
                    setReady(true);
                }

                const supabase = getSupabaseBrowser();
                const token =
                    (supabase
                        ? (await supabase.auth.getSession()).data.session?.access_token
                        : null) ?? stored?.accessToken;
                if (token) {
                    await adoptToken(token, stored);
                }
            } catch {
                /* keep whatever session we already restored */
            }
            ignoreSignOut = false;
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
                if (ignoreSignOut) {
                    return;
                }
                const still = await getSupabaseBrowser()?.auth.getSession();
                if (still?.data.session?.access_token) {
                    return;
                }
                persist(null);
                setSession(null);
                return;
            }
            if (next?.access_token) {
                patchToken(next.access_token);
            }
        }) ?? { data: { subscription: { unsubscribe() {} } } };

        return () => {
            cancelled = true;
            data.subscription.unsubscribe();
        };
    }, []);

    const signIn = useCallback(
        async (email: string, password: string): Promise<SignInResult> => {
            const live = await tryLiveLogin(email, password);
            if (live.ok) {
                persist(live.session);
                setSession(live.session);
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
                    persist(mock.session);
                    setSession(mock.session);
                    return mock;
                }
            }
            return { ok: false, error: live.error };
        },
        [users]
    );

    const applySession = useCallback((next: AuthSession) => {
        persist(next);
        setSession(next);
    }, []);

    const signOut = useCallback(() => {
        persist(null);
        sessionStorage.removeItem(ADMIN_BACKUP_KEY);
        setSession(null);
        void getSupabaseBrowser()?.auth.signOut();
    }, []);

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

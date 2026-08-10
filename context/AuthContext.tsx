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
    type AuthSession,
    resolveLogin,
} from "@/lib/auth/resolveLogin";

type AuthContextValue = {
    session: AuthSession | null;
    ready: boolean;
    signIn: (
        email: string,
        password: string
    ) => { ok: true; session: AuthSession } | { ok: false; error: string };
    signOut: () => void;
    changePassword: (
        current: string,
        next: string
    ) => { ok: boolean; error?: string };
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const { users } = useAdminData();
    const [session, setSession] = useState<AuthSession | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
            if (raw) {
                setSession(JSON.parse(raw) as AuthSession);
            }
        } catch {
            sessionStorage.removeItem(AUTH_SESSION_KEY);
        }
        setReady(true);
    }, []);

    const signIn = useCallback(
        (email: string, password: string) => {
            const result = resolveLogin(email, password, users);
            if (!result.ok) return result;

            sessionStorage.setItem(
                AUTH_SESSION_KEY,
                JSON.stringify(result.session)
            );
            setSession(result.session);
            return result;
        },
        [users]
    );

    const signOut = useCallback(() => {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        setSession(null);
    }, []);

    const changePassword = useCallback(
        (current: string, next: string) => {
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
            // Mock auth: accept any non-empty current password; no server store yet.
            return { ok: true };
        },
        [session]
    );

    const value = useMemo(
        () => ({ session, ready, signIn, signOut, changePassword }),
        [session, ready, signIn, signOut, changePassword]
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

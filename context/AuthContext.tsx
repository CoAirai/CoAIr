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

    const value = useMemo(
        () => ({ session, ready, signIn, signOut }),
        [session, ready, signIn, signOut]
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

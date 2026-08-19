import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const AUTH_EMAIL_DOMAIN =
    process.env.NEXT_PUBLIC_SUPABASE_AUTH_EMAIL_DOMAIN ?? "users.coair.local";

export function isSupabaseAuthConfigured(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    );
}

export function isInviteOrRecoveryCallback(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    const blob = `${window.location.hash}${window.location.search}`;
    return /(?:^|[?#&])type=(recovery|invite|signup)\b/i.test(blob);
}

export function shouldDeferAppSession(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    if (window.location.pathname.startsWith("/auth/reset-password")) {
        return true;
    }
    return isInviteOrRecoveryCallback();
}

export function authEmailFromUsername(username: string): string {
    const clean = username.trim();
    if (clean.includes("@")) {
        return clean.toLowerCase();
    }
    return `${clean.toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anon) {
        return null;
    }
    if (!browserClient) {
        browserClient = createClient(url, anon, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        });
    }
    return browserClient;
}

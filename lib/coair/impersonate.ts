import { impersonateAdminUser } from "./admin";
import { sessionFromAccessToken } from "./liveLogin";
import {
    ADMIN_BACKUP_KEY,
    type AuthSession,
} from "@/lib/auth/resolveLogin";
import { homeUrlForSession } from "@/lib/auth/hosts";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export async function startLiveImpersonation(input: {
    adminSession: AuthSession;
    token: string;
    username: string;
    applySession: (session: AuthSession) => void;
}): Promise<{ session: AuthSession; href: string }> {
    const result = await impersonateAdminUser(input.token, input.username);
    sessionStorage.setItem(
        ADMIN_BACKUP_KEY,
        JSON.stringify(input.adminSession)
    );
    if (result.refresh_token) {
        await getSupabaseBrowser()?.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
        });
    }
    const session = await sessionFromAccessToken(
        result.access_token,
        result.user,
        result.impersonator
    );
    input.applySession(session);
    return { session, href: homeUrlForSession(session) };
}

export function stopLiveImpersonation(
    applySession: (session: AuthSession) => void
): string | null {
    const raw = sessionStorage.getItem(ADMIN_BACKUP_KEY);
    sessionStorage.removeItem(ADMIN_BACKUP_KEY);
    if (!raw) return null;
    try {
        const session = JSON.parse(raw) as AuthSession;
        applySession(session);
        return homeUrlForSession(session);
    } catch {
        return null;
    }
}

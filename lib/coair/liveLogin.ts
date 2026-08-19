import { CoairApiError, coairFetch, isApiUnreachable } from "./client";
import { mapLiveSession } from "./mapSession";
import type { AuthSession } from "@/lib/auth/resolveLogin";
import {
    authEmailFromUsername,
    getSupabaseBrowser,
    isSupabaseAuthConfigured,
} from "@/lib/supabase/browser";
import type {
    CoairLoginResponse,
    CoairOrgResponse,
    CoairProjectsResponse,
    CoairUserPayload,
} from "./types";

export type LiveLoginResult =
    | { ok: true; session: AuthSession }
    | { ok: false; kind: "invalid" | "unreachable"; error: string }
    | {
          ok: false;
          kind: "mfa";
          mfaToken: string;
          debugCode?: string;
          username: string;
      };

async function readOrg(token: string): Promise<CoairOrgResponse | null> {
    try {
        return await coairFetch<CoairOrgResponse>("/org", { token });
    } catch (error) {
        if (error instanceof CoairApiError && (error.status === 403 || error.status === 404)) {
            return null;
        }
        throw error;
    }
}

async function firstProjectId(token: string): Promise<string | null> {
    try {
        const payload = await coairFetch<CoairProjectsResponse>("/projects", {
            token,
        });
        return payload.projects?.[0]?.project_id ?? null;
    } catch (error) {
        if (error instanceof CoairApiError && (error.status === 403 || error.status === 404)) {
            return null;
        }
        throw error;
    }
}

export const MFA_CHALLENGE_KEY = "coair.mfaChallenge";
export const RESET_TOKEN_KEY = "coair.resetToken";
export const RESET_EMAIL_KEY = "coair.resetEmail";

export type MfaChallenge = {
    mfaToken: string;
    debugCode?: string;
    username: string;
};

async function adoptSupabaseSession(
    accessToken: string,
    refreshToken?: string | null
): Promise<void> {
    const supabase = getSupabaseBrowser();
    if (!supabase || !accessToken || !refreshToken) {
        return;
    }
    await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
    });
}

export async function sessionFromAccessToken(
    accessToken: string,
    user: CoairUserPayload,
    impersonator?: string
): Promise<AuthSession> {
    const [org, projectId] = await Promise.all([
        readOrg(accessToken).catch(() => null),
        firstProjectId(accessToken).catch(() => null),
    ]);
    return mapLiveSession({
        user,
        accessToken,
        org,
        projectId,
        impersonator,
    });
}

export async function sessionFromLiveToken(
    accessToken: string,
    impersonator?: string
): Promise<AuthSession> {
    const me = await coairFetch<{ user: CoairUserPayload }>("/auth/me", {
        token: accessToken,
    });
    return sessionFromAccessToken(accessToken, me.user, impersonator);
}

async function loginViaApi(
    username: string,
    password: string
): Promise<CoairLoginResponse> {
    return coairFetch<CoairLoginResponse>("/auth/login", {
        method: "POST",
        body: { username, password },
    });
}

export async function tryLiveLogin(
    username: string,
    password: string
): Promise<LiveLoginResult> {
    const trimmed = username.trim();
    if (!trimmed || !password.trim()) {
        return { ok: false, kind: "invalid", error: "Username and password required" };
    }

    try {
        const supabase = getSupabaseBrowser();
        if (supabase) {
            const email = authEmailFromUsername(trimmed);
            const first = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (first.error) {
                let login: CoairLoginResponse | null = null;
                try {
                    login = await loginViaApi(trimmed, password);
                } catch (error) {
                    if (isApiUnreachable(error)) throw error;
                    login = null;
                }
                if (login?.access_token) {
                    await adoptSupabaseSession(login.access_token, login.refresh_token);
                    return {
                        ok: true,
                        session: await sessionFromAccessToken(
                            login.access_token,
                            login.user
                        ),
                    };
                }
                if (login?.mfa_required && login.mfa_token) {
                    return {
                        ok: false,
                        kind: "mfa",
                        mfaToken: login.mfa_token,
                        debugCode: login.debug_code,
                        username: trimmed,
                    };
                }
                return {
                    ok: false,
                    kind: "invalid",
                    error: "Invalid username or password",
                };
            }
            if (first.data.session?.access_token) {
                try {
                    return {
                        ok: true,
                        session: await sessionFromLiveToken(
                            first.data.session.access_token
                        ),
                    };
                } catch (error) {
                    await supabase.auth.signOut({ scope: "local" });
                    throw error;
                }
            }
        }

        const login = await loginViaApi(trimmed, password);
        if (login.mfa_required && login.mfa_token) {
            return {
                ok: false,
                kind: "mfa",
                mfaToken: login.mfa_token,
                debugCode: login.debug_code,
                username: trimmed,
            };
        }
        if (!login.access_token) {
            return {
                ok: false,
                kind: "invalid",
                error: "Invalid username or password",
            };
        }
        await adoptSupabaseSession(login.access_token, login.refresh_token);
        return {
            ok: true,
            session: await sessionFromAccessToken(login.access_token, login.user),
        };
    } catch (error) {
        if (isApiUnreachable(error)) {
            return {
                ok: false,
                kind: "unreachable",
                error: "Can't reach the COAir API. Start Docker, then try again.",
            };
        }
        if (error instanceof CoairApiError && error.status === 401) {
            return {
                ok: false,
                kind: "invalid",
                error: "Invalid username or password",
            };
        }
        return {
            ok: false,
            kind: "unreachable",
            error:
                error instanceof Error
                    ? error.message
                    : "Can't reach the COAir API",
        };
    }
}

export { isSupabaseAuthConfigured };

export async function createConversation(
    token: string,
    projectId: string,
    title: string
) {
    return coairFetch<{ conversation_id: string }>("/conversations", {
        method: "POST",
        token,
        projectId,
        body: { title },
    });
}

export async function sendLiveChat(input: {
    token: string;
    projectId: string;
    conversationId: string;
    message: string;
    requestId: string;
}) {
    return coairFetch<{
        assistant_text: string;
        citations?: Array<{
            doc_id?: string;
            doc_name?: string;
            anchor?: string;
            snippet?: string;
        }>;
    }>("/chat", {
        method: "POST",
        token: input.token,
        projectId: input.projectId,
        timeoutMs: 120000,
        body: {
            message: input.message,
            conversation_id: input.conversationId,
            mode: "chat",
            request_id: input.requestId,
        },
    });
}

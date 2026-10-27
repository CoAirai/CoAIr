import { readAnswerStream, type AnswerStreamEvent } from "@/lib/chat/answerStream";
import { COAIR_API_BASE, CoairApiError, coairFetch, isApiUnreachable } from "./client";
import { showAuthDebugCodes } from "./debugFlags";
import { mapLiveSession } from "./mapSession";
import { readTrustedDeviceTokenForLogin } from "./trustedDevice";
import type { AuthSession } from "@/lib/auth/resolveLogin";
import {
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    readSharedItem,
    removeSharedItem,
    writeSharedItem,
} from "@/lib/auth/sharedStorage";
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
import { hydrateProfilePrefsFromFeatures } from "@/lib/settings/localPrefs";

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
        const payload = await coairFetch<
            CoairProjectsResponse & {
                account_usage?: Record<string, unknown>;
            }
        >("/projects", { token });
        try {
            sessionStorage.setItem(
                "coair.live.bootstrap",
                JSON.stringify({
                    projects: payload.projects ?? [],
                    accountUsage: payload.account_usage ?? null,
                })
            );
        } catch {
            /* ignore quota */
        }
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
    /** Where to send the user after MFA (admin portal vs workspace). */
    portal?: "admin" | "workspace";
};

export function saveMfaChallenge(challenge: MfaChallenge): void {
    const raw = JSON.stringify(challenge);
    try {
        sessionStorage.setItem(MFA_CHALLENGE_KEY, raw);
    } catch {
        /* ignore */
    }
    writeSharedItem(MFA_CHALLENGE_KEY, raw);
}

export function readMfaChallenge(): MfaChallenge | null {
    try {
        const sessionRaw = sessionStorage.getItem(MFA_CHALLENGE_KEY);
        if (sessionRaw) {
            return JSON.parse(sessionRaw) as MfaChallenge;
        }
    } catch {
        /* ignore */
    }
    const shared = readSharedItem(MFA_CHALLENGE_KEY);
    if (!shared) return null;
    try {
        return JSON.parse(shared) as MfaChallenge;
    } catch {
        removeSharedItem(MFA_CHALLENGE_KEY);
        return null;
    }
}

export function clearMfaChallenge(): void {
    try {
        sessionStorage.removeItem(MFA_CHALLENGE_KEY);
    } catch {
        /* ignore */
    }
    removeSharedItem(MFA_CHALLENGE_KEY);
}

async function adoptSupabaseSession(
    accessToken: string,
    refreshToken?: string | null
): Promise<void> {
    if (accessToken) {
        writeSharedItem(ACCESS_TOKEN_KEY, accessToken, true);
    }
    if (refreshToken) {
        // Shared across *.coair.ai — localStorage alone is per-subdomain and
        // caused refresh failures (logout flicker) after redirect from login → user.
        writeSharedItem(REFRESH_TOKEN_KEY, refreshToken, true);
    }
    const supabase = getSupabaseBrowser();
    if (!supabase || !accessToken || !refreshToken) {
        return;
    }
    await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
    });
}

/** Rehydrate Supabase on any portal from shared access/refresh cookies. */
export async function hydrateSharedSupabaseSession(): Promise<string | null> {
    const access = readSharedItem(ACCESS_TOKEN_KEY)?.trim() || "";
    const refresh = readSharedItem(REFRESH_TOKEN_KEY)?.trim() || "";
    if (!access) return null;
    if (refresh) {
        try {
            await adoptSupabaseSession(access, refresh);
        } catch {
            /* keep access cookie; adoptToken may still work */
        }
    }
    return access;
}

/** Browser/Supabase logins skip /auth/login — ask API to send login emails. */
async function reportLoginAlert(token: string): Promise<void> {
    try {
        await coairFetch<{ ok: boolean }>("/auth/login-notify", {
            method: "POST",
            token,
        });
    } catch {
        /* non-blocking — login must still succeed */
    }
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
    hydrateProfilePrefsFromFeatures(user.features ?? null);
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
    const device_token = readTrustedDeviceTokenForLogin(username) || "";
    return coairFetch<CoairLoginResponse>("/auth/login", {
        method: "POST",
        body: { username, password, device_token },
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

    // Prefer API login so MFA + login-alert emails always run server-side.
    try {
        const login = await loginViaApi(trimmed, password);
        if (login.mfa_required) {
            if (!login.mfa_token) {
                return {
                    ok: false,
                    kind: "invalid",
                    error: "MFA was required but no challenge was issued. Try again.",
                };
            }
            return {
                ok: false,
                kind: "mfa",
                mfaToken: login.mfa_token,
                debugCode: showAuthDebugCodes() ? login.debug_code : undefined,
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
    } catch (apiError) {
        if (apiError instanceof CoairApiError && apiError.status === 401) {
            return {
                ok: false,
                kind: "invalid",
                error: "Invalid username or password",
            };
        }
        if (
            apiError instanceof CoairApiError &&
            apiError.status === 403 &&
            /invite_not_activated/.test(apiError.body || apiError.message)
        ) {
            return {
                ok: false,
                kind: "invalid",
                error: "invite_not_activated",
            };
        }
        if (!isApiUnreachable(apiError)) {
            // Unexpected API failure — still try Supabase as soft fallback below.
        }
    }

    try {
        const supabase = getSupabaseBrowser();
        if (!supabase) {
            return {
                ok: false,
                kind: "unreachable",
                error: "Can't reach the COAir API. Start Docker, then try again.",
            };
        }
        const email = authEmailFromUsername(trimmed);
        const first = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (first.error || !first.data.session?.access_token) {
            return {
                ok: false,
                kind: "invalid",
                error: "Invalid username or password",
            };
        }
        try {
            const session = await sessionFromLiveToken(
                first.data.session.access_token
            );
            void reportLoginAlert(first.data.session.access_token);
            return { ok: true, session };
        } catch (error) {
            await supabase.auth.signOut({ scope: "local" });
            throw error;
        }
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
    return coairFetch<{ conversation_id: string; title?: string }>(
        "/conversations",
        {
            method: "POST",
            token,
            projectId,
            body: { title },
        }
    );
}

export type CoairConversationMeta = {
    conversation_id: string;
    title: string;
    created_at?: string;
    updated_at?: string;
    message_count?: number;
    pinned?: boolean;
    archived?: boolean;
};

export type CoairConversationMessage = {
    role: string;
    content: string;
    timestamp?: string;
    response?: {
        assistant_text?: string;
        sql_artifact?: import("@/lib/chat/types").SqlArtifact | null;
        citations?: Array<{
            doc_id?: string;
            doc_name?: string;
            anchor?: string;
            snippet?: string;
        }>;
        answer?: string;
    };
};

export async function listConversations(
    token: string,
    projectId: string,
    archived = false
) {
    const path = archived ? "/conversations?archived=true" : "/conversations";
    return coairFetch<CoairConversationMeta[]>(path, { token, projectId });
}

export async function renameConversation(
    token: string,
    projectId: string,
    conversationId: string,
    title: string
) {
    return coairFetch<{ ok?: boolean }>(
        `/conversations/${encodeURIComponent(conversationId)}`,
        { method: "PATCH", token, projectId, body: { title } }
    );
}

export async function pinConversation(
    token: string,
    projectId: string,
    conversationId: string,
    pinned: boolean
) {
    return coairFetch<CoairConversationMeta>(
        `/conversations/${encodeURIComponent(conversationId)}/pin`,
        { method: "PATCH", token, projectId, body: { pinned } }
    );
}

export async function setConversationPinOrder(
    token: string,
    projectId: string,
    conversationIds: string[]
) {
    return coairFetch<CoairConversationMeta[]>("/conversations/pin-order", {
        method: "POST",
        token,
        projectId,
        body: { conversation_ids: conversationIds },
    });
}

export async function archiveConversation(
    token: string,
    projectId: string,
    conversationId: string,
    archived: boolean
) {
    return coairFetch<CoairConversationMeta>(
        `/conversations/${encodeURIComponent(conversationId)}/archive`,
        { method: "PATCH", token, projectId, body: { archived } }
    );
}

export async function deleteConversation(
    token: string,
    projectId: string,
    conversationId: string
) {
    return coairFetch<{ ok?: boolean }>(
        `/conversations/${encodeURIComponent(conversationId)}`,
        { method: "DELETE", token, projectId }
    );
}

export async function getConversation(
    token: string,
    projectId: string,
    conversationId: string
) {
    return coairFetch<{
        conversation_id: string;
        title: string;
        messages: CoairConversationMessage[];
    }>(`/conversations/${encodeURIComponent(conversationId)}`, {
        token,
        projectId,
    });
}

export async function sendLiveChat(input: {
    token: string;
    projectId: string;
    conversationId: string;
    message: string;
    requestId: string;
    signal?: AbortSignal;
    onEvent?: (event: AnswerStreamEvent) => void;
}) {
    type ChatResult = {
        assistant_text: string;
        sql_artifact?: import("@/lib/chat/types").SqlArtifact | null;
        citations?: Array<{
            doc_id?: string;
            doc_name?: string;
            anchor?: string;
            snippet?: string;
        }>;
    };
    const body = {
        message: input.message, conversation_id: input.conversationId,
        mode: "chat", request_id: input.requestId,
    };
    const response = await fetch(`${COAIR_API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream",
            Authorization: `Bearer ${input.token}`, "X-Project-ID": input.projectId },
        body: JSON.stringify(body), signal: input.signal,
    });
    if (response.ok) return readAnswerStream<ChatResult>(response, input.onEvent);
    // A rolling deployment may briefly serve the older API. Only a missing
    // endpoint permits fallback; never replay a started/billed streaming POST.
    if (response.status !== 404 && response.status !== 405) {
        const text = await response.text();
        let message = "Unable to start the answer.";
        try { const value = JSON.parse(text); if (typeof value.detail === "string") message = value.detail; } catch { /* generic safe error */ }
        throw new CoairApiError(message, response.status, text);
    }
    return coairFetch<ChatResult>("/chat", {
        method: "POST",
        token: input.token,
        projectId: input.projectId,
        timeoutMs: 120000,
        signal: input.signal,
        body: {
            message: input.message,
            conversation_id: input.conversationId,
            mode: "chat",
            request_id: input.requestId,
        },
    });
}

export type ChatActivityStep = { kind: string; label: string; detail?: string };

export async function getChatProgress(
    token: string,
    projectId: string,
    requestId: string,
    signal?: AbortSignal
) {
    return coairFetch<{ steps: ChatActivityStep[]; done: boolean }>(
        `/chat/progress/${encodeURIComponent(requestId)}`,
        { token, projectId, signal, timeoutMs: 10000 }
    );
}

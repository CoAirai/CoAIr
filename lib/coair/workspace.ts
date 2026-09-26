import { COAIR_API_BASE, CoairApiError, coairFetch } from "./client";
import type { CoairLibraryDoc } from "./mapLibrary";
import type { CoairProject } from "./types";

/**
 * Large uploads must bypass the Next.js `/coair-api` proxy (Vercel ~4.5MB body
 * limit → HTTP 413). Prefer a direct API origin in the browser.
 */
export function resolveUploadApiBase(): string {
    const explicit = (
        process.env.NEXT_PUBLIC_COAIR_UPLOAD_BASE ||
        process.env.NEXT_PUBLIC_COAIR_API_ORIGIN ||
        ""
    )
        .trim()
        .replace(/\/$/, "");
    if (explicit) {
        return explicit.endsWith("/api") ? explicit : `${explicit}/api`;
    }
    if (typeof window !== "undefined") {
        const host = window.location.hostname;
        if (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host.endsWith(".local")
        ) {
            return COAIR_API_BASE;
        }
        // Production portals (login/user/admin.coair.ai or Vercel previews).
        return "https://api.coair.ai/api";
    }
    return COAIR_API_BASE;
}

function friendlyUploadError(status: number, raw: string): string {
    if (status === 413) {
        return (
            "File is too large for the upload path. Use a direct API upload " +
            "(files up to ~100MB are supported on api.coair.ai)."
        );
    }
    const message = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    try {
        const parsed = JSON.parse(raw) as {
            detail?: unknown;
            error?: { message?: string; code?: string } | string;
            message?: string;
        };
        if (typeof parsed?.detail === "string") return parsed.detail;
        if (typeof parsed?.error === "string") return parsed.error;
        if (parsed?.error && typeof parsed.error === "object") {
            if (parsed.error.code === "413" || status === 413) {
                return "File is too large for the current upload limit.";
            }
            if (parsed.error.message) return parsed.error.message;
        }
        if (typeof parsed?.message === "string") return parsed.message;
    } catch {
        /* keep stripped text */
    }
    return message || "Upload failed";
}

export async function listProjects(token: string) {
    return coairFetch<{
        projects: CoairProject[];
        account_usage?: {
            used_tokens?: number;
            token_limit?: number;
            credits_remaining?: number;
            credits_total?: number;
            storage_used_bytes?: number;
            storage_limit_bytes?: number;
            percent_remaining?: number;
        };
    }>("/projects", { token });
}

export async function createProject(token: string, name: string) {
    return coairFetch<CoairProject>("/projects", {
        method: "POST",
        token,
        body: { name, embedding_profile: "local-bge-v1" },
    });
}

export async function listOrgProjects(token: string) {
    return coairFetch<{ projects: CoairProject[] }>("/org/projects", { token });
}

export async function listOrgProjectMembers(token: string, projectId: string) {
    return coairFetch<{
        members: Array<{
            username: string;
            display_name?: string;
            role: string;
            is_active?: boolean;
        }>;
    }>(`/org/projects/${encodeURIComponent(projectId)}/members`, { token });
}

export async function grantOrgProjectAccess(
    token: string,
    projectId: string,
    username: string,
    role: "owner" | "editor" | "viewer"
) {
    return coairFetch<{ ok?: boolean; members?: unknown[] }>(
        `/org/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(username)}`,
        { method: "PUT", token, body: { role } }
    );
}

export async function revokeOrgProjectAccess(
    token: string,
    projectId: string,
    username: string
) {
    return coairFetch<void>(
        `/org/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(username)}`,
        { method: "DELETE", token }
    );
}

export async function listLibrary(token: string, projectId: string) {
    return coairFetch<CoairLibraryDoc[]>("/library", { token, projectId });
}

export type UploadProjectResult = {
    file_id?: string;
    filename?: string;
    status?: string;
};

export type IndexingStatus = {
    file_id: string;
    filename: string;
    status: string;
    progress: number;
    error?: string | null;
    details?: Record<string, unknown>;
};

/** Browser XHR upload so we can report byte progress for large PDFs. */
export function uploadProjectFile(
    token: string,
    projectId: string,
    file: File,
    onProgress?: (percent: number) => void
): Promise<UploadProjectResult> {
    const body = new FormData();
    body.append("file", file);
    const base = resolveUploadApiBase();

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}/upload`);
        xhr.setRequestHeader("Accept", "application/json");
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("X-Project-ID", projectId);
        xhr.timeout = 10 * 60 * 1000;

        xhr.upload.onprogress = (event) => {
            if (!onProgress || !event.lengthComputable || !event.total) return;
            onProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
        };

        xhr.onload = () => {
            const text = xhr.responseText || "";
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(text ? (JSON.parse(text) as UploadProjectResult) : {});
                } catch {
                    resolve({});
                }
                return;
            }
            reject(
                new CoairApiError(
                    friendlyUploadError(xhr.status, text),
                    xhr.status,
                    text
                )
            );
        };
        xhr.onerror = () => reject(new CoairApiError("Network error", 0));
        xhr.ontimeout = () => reject(new CoairApiError("Upload timed out", 0));
        xhr.send(body);
    });
}

export async function listIndexingStatus(token: string, projectId: string) {
    return coairFetch<IndexingStatus[]>("/indexing/status", { token, projectId });
}

export async function deleteProjectFile(
    token: string,
    projectId: string,
    fileId: string
) {
    return coairFetch<void>(`/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
        token,
        projectId,
    });
}

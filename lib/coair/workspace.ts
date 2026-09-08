import { coairFetch } from "./client";
import type { CoairLibraryDoc } from "./mapLibrary";
import type { CoairProject } from "./types";

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

export async function uploadProjectFile(
    token: string,
    projectId: string,
    file: File
) {
    const body = new FormData();
    body.append("file", file);
    return coairFetch<{ file_id?: string; filename?: string; status?: string }>(
        "/upload",
        { method: "POST", token, projectId, body }
    );
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

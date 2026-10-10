import { coairFetch } from "./client";

export type CoairProgramme = {
    file_id: string;
    name: string;
    size_bytes?: number;
    created_at?: string;
};

export type CoairForensicWorkspace = {
    workspace_id: string;
    name: string;
    programme_ids?: string[];
    created_at?: string;
};

export type CoairForensicMetric = {
    label?: string;
    value?: string | number;
};

export type CoairForensicTableRow = {
    number?: number;
    name?: string;
    status?: string;
    metric_label?: string;
    metric_value?: string | number;
    threshold?: string;
    summary?: string;
    affected_ids?: string[];
    detail_rows?: Array<Record<string, unknown>>;
    na_reason?: string | null;
};

export type CoairForensicRun = {
    run_id?: string;
    status?: string;
    stage?: string;
    module_slug?: string;
    error?: string;
    error_code?: string;
    result?: {
        title?: string;
        summary?: string;
        findings?: string[] | string;
        narrative?: string;
        text?: string;
        warnings?: string[];
        metrics?: CoairForensicMetric[];
        tables?: Array<{
            name?: string;
            rows?: CoairForensicTableRow[];
        }>;
    };
};

export async function listForensicProgrammes(token: string, projectId: string) {
    return coairFetch<{
        programmes: CoairProgramme[];
        max_workspace_bytes?: number;
    }>("/forensic/programmes", { token, projectId });
}

export async function uploadForensicProgramme(
    token: string,
    projectId: string,
    file: File
) {
    const body = new FormData();
    body.append("file", file);
    return coairFetch<CoairProgramme & { duplicate?: boolean }>(
        "/forensic/programmes",
        { method: "POST", token, projectId, body }
    );
}

export async function listForensicWorkspaces(token: string, projectId: string) {
    return coairFetch<{ workspaces: CoairForensicWorkspace[] }>(
        "/forensic/workspaces",
        { token, projectId }
    );
}

export async function createForensicWorkspace(
    token: string,
    projectId: string,
    input: { name: string; programme_ids: string[] }
) {
    return coairFetch<CoairForensicWorkspace>("/forensic/workspaces", {
        method: "POST",
        token,
        projectId,
        body: {
            name: input.name,
            programme_ids: input.programme_ids,
            settings: {},
        },
    });
}

export function defaultForensicRunParameters(moduleSlug: string) {
    if (moduleSlug === "impacted-as-planned") {
        return null;
    }
    if (moduleSlug === "collapsed-as-built") {
        return null;
    }
    if (moduleSlug === "time-impact-analysis") {
        return null;
    }
    if (moduleSlug === "evidence-led-draft") {
        return null;
    }
    return { kind: moduleSlug };
}

export async function createForensicRun(
    token: string,
    projectId: string,
    workspaceId: string,
    moduleSlug: string
) {
    const parameters = defaultForensicRunParameters(moduleSlug);
    if (!parameters) {
        throw new Error("This analysis needs extra inputs that are not in the UI yet.");
    }
    return coairFetch<CoairForensicRun>(
        `/forensic/workspaces/${encodeURIComponent(workspaceId)}/modules/${encodeURIComponent(moduleSlug)}/runs`,
        {
            method: "POST",
            token,
            projectId,
            timeoutMs: 30000,
            body: { parameters, ai_narrative: false },
        }
    );
}

export async function listForensicRuns(
    token: string,
    projectId: string,
    workspaceId: string
) {
    return coairFetch<{ runs: CoairForensicRun[] }>(
        `/forensic/runs?workspace_id=${encodeURIComponent(workspaceId)}`,
        { token, projectId }
    );
}

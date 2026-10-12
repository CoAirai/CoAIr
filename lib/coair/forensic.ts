import { COAIR_API_BASE, CoairApiError, coairFetch } from "./client";

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

export type CoairForensicArtifact = {
    artifact_id: string;
    name: string;
    kind?: string;
    mime_type?: string;
};

export type CoairForensicRun = {
    run_id?: string;
    status?: string;
    stage?: string;
    module_slug?: string;
    error?: string;
    error_code?: string;
    artifacts?: CoairForensicArtifact[];
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

export async function deleteForensicProgramme(
    token: string,
    projectId: string,
    fileId: string
) {
    return coairFetch<void>(
        `/forensic/programmes/${encodeURIComponent(fileId)}`,
        { method: "DELETE", token, projectId }
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

export type ForensicDelayInput = {
    activity?: string;
    start?: string;
    finish?: string;
    activityCodes?: string;
    anchor?: string;
};

function delayDays(start: string, finish: string) {
    const from = Date.parse(start);
    const to = Date.parse(finish);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
    return Math.max(0, Math.round((to - from) / 86400000));
}

function delayEvent(input: ForensicDelayInput) {
    const activity = (input.activity || "").trim();
    const start = (input.start || "").trim();
    const finish = (input.finish || "").trim();
    const duration = delayDays(start, finish);
    if (!activity || !start || !finish || duration === null) return null;
    const code = activity.slice(0, 120);
    return {
        event: {
            event_id: code,
            title: activity.slice(0, 500),
            description: `${start} to ${finish}`,
            date_raised: start,
        },
        fragnet: [
            {
                id: code,
                name: activity.slice(0, 500),
                duration_days: duration,
            },
        ],
    };
}

export function forensicRunParameters(
    moduleSlug: string,
    input: ForensicDelayInput = {}
): Record<string, unknown> | null {
    if (moduleSlug === "evidence-led-draft") return null;
    if (
        moduleSlug === "impacted-as-planned" ||
        moduleSlug === "time-impact-analysis"
    ) {
        const event = delayEvent(input);
        if (!event) return null;
        if (moduleSlug === "time-impact-analysis") {
            return { kind: moduleSlug, events: [event], target_milestone: "" };
        }
        return { kind: moduleSlug, events: [event] };
    }
    if (moduleSlug === "collapsed-as-built") {
        const codes = (input.activityCodes || "")
            .split(/[\n,]/)
            .map((code) => code.trim())
            .filter(Boolean)
            .slice(0, 5000);
        if (codes.length === 0) return null;
        return {
            kind: moduleSlug,
            remove_activity_codes: codes,
            anchor_code: (input.anchor || "").trim().slice(0, 120),
        };
    }
    return { kind: moduleSlug };
}

export function defaultForensicRunParameters(moduleSlug: string) {
    return forensicRunParameters(moduleSlug);
}

export async function createForensicRun(
    token: string,
    projectId: string,
    workspaceId: string,
    moduleSlug: string,
    parameters?: Record<string, unknown> | null
) {
    const bodyParameters =
        parameters === undefined
            ? defaultForensicRunParameters(moduleSlug)
            : parameters;
    if (!bodyParameters) {
        throw new Error("This analysis needs extra inputs that are not in the UI yet.");
    }
    return coairFetch<CoairForensicRun>(
        `/forensic/workspaces/${encodeURIComponent(workspaceId)}/modules/${encodeURIComponent(moduleSlug)}/runs`,
        {
            method: "POST",
            token,
            projectId,
            timeoutMs: 30000,
            body: { parameters: bodyParameters, ai_narrative: false },
        }
    );
}

export async function downloadForensicArtifact(
    token: string,
    projectId: string,
    artifactId: string,
    fileName: string
) {
    const response = await fetch(
        `${COAIR_API_BASE}/forensic/artifacts/${encodeURIComponent(artifactId)}/download`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "X-Project-ID": projectId,
            },
        }
    );
    if (!response.ok) {
        throw new CoairApiError("The result file is not ready", response.status);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "forensic-result";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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

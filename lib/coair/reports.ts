import { COAIR_API_BASE, coairFetch } from "./client";
import type { CoairReportJob } from "./mapChronology";

export async function listReports(
    token: string,
    projectId: string,
    module: "chronology" | "forensic"
) {
    return coairFetch<{ reports: CoairReportJob[] }>(
        `/reports?module=${module}`,
        { token, projectId }
    );
}

export async function getReport(
    token: string,
    projectId: string,
    jobId: string
) {
    return coairFetch<CoairReportJob>(
        `/reports/${encodeURIComponent(jobId)}`,
        { token, projectId }
    );
}

export async function generateChronology(
    token: string,
    projectId: string,
    input: {
        topic: string;
        date_from?: string;
        date_to?: string;
        parties?: string[];
        source_doc_ids?: string[];
    }
) {
    return coairFetch<CoairReportJob>("/chronology/generate", {
        method: "POST",
        token,
        projectId,
        timeoutMs: 30000,
        body: {
            topic: input.topic,
            date_from: input.date_from ?? "",
            date_to: input.date_to ?? "",
            parties: input.parties ?? [],
            source_doc_ids: input.source_doc_ids ?? [],
        },
    });
}

export async function downloadReportDocument(
    token: string,
    projectId: string,
    jobId: string
) {
    const response = await fetch(
        `${COAIR_API_BASE}/reports/${encodeURIComponent(jobId)}/document`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "X-Project-ID": projectId,
            },
        }
    );
    if (!response.ok) {
        throw new Error("Report document is not ready");
    }
    return response.blob();
}

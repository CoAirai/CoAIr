import { coairFetch } from "./client";

export type CoairDocContent = {
    type: "pdf" | "table" | "text" | string;
    file_name?: string;
    page?: number;
    total_pages?: number;
    image_base64?: string;
    text?: string;
    columns?: string[];
    rows?: Record<string, unknown>[];
    total_rows?: number;
    error?: string | null;
    sheet_name?: string;
};

export async function fetchDocContent(
    token: string,
    projectId: string,
    docId: string,
    options?: { anchor?: string; fileName?: string }
): Promise<CoairDocContent> {
    const params = new URLSearchParams();
    if (options?.anchor) params.set("anchor", options.anchor);
    if (options?.fileName) params.set("file_name", options.fileName);
    const qs = params.toString();
    const id = encodeURIComponent(docId || options?.fileName || "doc");
    return coairFetch<CoairDocContent>(
        `/docs/${id}/content${qs ? `?${qs}` : ""}`,
        { token, projectId }
    );
}

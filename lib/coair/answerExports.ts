import { COAIR_API_BASE } from "./client";
import type { Message } from "@/lib/chat/types";

export function answerDocumentPayload(message: Message) {
    const artifact = message.sqlArtifact;
    const columns = artifact?.columns.length ? artifact.columns : Object.keys(artifact?.preview_rows[0] ?? {});
    return {
        answer: message.content,
        citations: (message.citations ?? []).map(citation => ({
            doc_name: citation.name, anchor: `page_${citation.page}`, snippet: citation.excerpt,
        })),
        sql: artifact?.generated_sql ?? "",
        table_columns: columns,
        table_rows: artifact?.preview_rows.map(row => columns.map(column => row[column] ?? null)) ?? [],
        total_rows: artifact?.row_count,
    };
}

export async function downloadAnswerExport(
    kind: "document" | "spreadsheet", token: string, projectId: string, body: unknown
) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
        const response = await fetch(`${COAIR_API_BASE}/chat/${kind}`, {
            method: "POST", signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, "X-Project-ID": projectId, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`Unable to download ${kind === "document" ? "Word document" : "Excel workbook"} (${response.status}).`);
        return response.blob();
    } finally { clearTimeout(timer); }
}

export function saveAnswerFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

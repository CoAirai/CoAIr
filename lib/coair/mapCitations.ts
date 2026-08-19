import type { Citation } from "@/lib/chat/types";
import type { CoairCitation } from "./types";

export function pageFromAnchor(anchor: string | undefined): number {
    if (!anchor) return 1;
    const match = anchor.match(/(\d+)/);
    if (!match) return 1;
    const page = Number.parseInt(match[1], 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
}

export function mapLiveCitations(citations: CoairCitation[] | undefined): Citation[] {
    if (!citations?.length) return [];
    return citations
        .filter((entry) => entry.doc_id || entry.doc_name)
        .map((entry) => ({
            documentId: entry.doc_id || entry.doc_name || "doc",
            name: entry.doc_name || entry.doc_id || "Document",
            page: pageFromAnchor(entry.anchor),
            excerpt: entry.snippet || "",
        }));
}

import { buildMockCitations, type CitedDocument } from "./citations";
import type { Citation } from "./types";

export function buildMockReply(
    userText: string,
    documentNames: string[] = []
): string {
    return buildMockAnswer(
        userText,
        documentNames.map((name, index) => ({
            id: `named-${index}`,
            name,
        }))
    ).content;
}

export function buildMockAnswer(
    userText: string,
    documents: CitedDocument[] = []
): { content: string; citations: Citation[] } {
    const trimmed = userText.trim();
    const citations = buildMockCitations(documents);
    const inline =
        citations.length > 0
            ? ` ${citations
                  .map((citation) => `(${citation.name}, p.${citation.page})`)
                  .join(" ")}`
            : "";

    if (!trimmed) {
        return {
            content: `Mock reply: Ask a question about your project documents and I’ll respond here until COAIR-Chat is connected.${inline}`,
            citations,
        };
    }

    return {
        content: `Mock reply: I received “${trimmed}”. This is a UI placeholder — COAIR-Chat will answer from your knowledge base once connected.${inline}`,
        citations,
    };
}

import type { Citation } from "@/lib/chat/types";

export type AnswerPart =
    | { type: "text"; text: string }
    | { type: "bold"; text: string }
    | { type: "cite"; name: string; page: number };

export type AnswerBlock =
    | { type: "heading"; parts: AnswerPart[] }
    | { type: "paragraph"; parts: AnswerPart[] };

const FILE_NAME =
    "[A-Za-z0-9][A-Za-z0-9_.\\- ]{0,160}?\\.(?:pdf|docx|doc|xlsx|xls|csv|txt|msg|eml)";
const CITE = new RegExp(`\\*?(${FILE_NAME})\\s*,\\s*p\\.?\\s*(\\d+)\\*?`, "gi");

function emphasisParts(text: string): AnswerPart[] {
    const cleaned = text.replace(
        /(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g,
        "$1$2"
    );
    const parts: AnswerPart[] = [];
    const bold = /\*\*([^*]+)\*\*/g;
    let last = 0;
    for (const match of cleaned.matchAll(bold)) {
        const index = match.index ?? 0;
        if (index > last) {
            parts.push({ type: "text", text: cleaned.slice(last, index) });
        }
        parts.push({ type: "bold", text: match[1] });
        last = index + match[0].length;
    }
    if (last < cleaned.length) {
        parts.push({ type: "text", text: cleaned.slice(last) });
    }
    return parts.filter((part) => part.type !== "text" || part.text.length > 0);
}

function inlineParts(text: string): AnswerPart[] {
    const parts: AnswerPart[] = [];
    const cites = new RegExp(CITE.source, "gi");
    let last = 0;
    for (const match of text.matchAll(cites)) {
        const index = match.index ?? 0;
        if (index > last) {
            parts.push(...emphasisParts(text.slice(last, index)));
        }
        parts.push({
            type: "cite",
            name: match[1].trim(),
            page: Number.parseInt(match[2], 10),
        });
        last = index + match[0].length;
    }
    if (last < text.length) {
        parts.push(...emphasisParts(text.slice(last)));
    }
    return parts;
}

function lineKind(line: string): "blank" | "rule" | "heading" | "bullet" | "text" {
    const trimmed = line.trim();
    if (!trimmed) return "blank";
    if (/^[-*_]{3,}$/.test(trimmed)) return "rule";
    if (/^#{1,6}\s+/.test(trimmed)) return "heading";
    if (
        /^\d+[.)]\s+\S/.test(trimmed) &&
        trimmed.length <= 80 &&
        !/[.!?]$/.test(trimmed)
    ) {
        return "heading";
    }
    if (/^(?:[-*]|\d+[.)])\s+/.test(trimmed)) return "bullet";
    return "text";
}

function lineText(line: string, kind: "heading" | "bullet" | "text") {
    const trimmed = line.trim();
    if (kind === "heading") {
        return trimmed.replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "");
    }
    if (kind === "bullet") {
        return trimmed.replace(/^(?:[-*]|\d+[.)])\s+/, "");
    }
    return trimmed;
}

export function parseAnswer(content: string): AnswerBlock[] {
    const blocks: AnswerBlock[] = [];
    let paragraph: string[] = [];

    const flush = () => {
        const text = paragraph.join(" ").trim();
        paragraph = [];
        if (!text) return;
        const parts = inlineParts(text);
        if (parts.length) blocks.push({ type: "paragraph", parts });
    };

    for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
        const kind = lineKind(line);
        if (kind === "blank" || kind === "rule") {
            flush();
            continue;
        }
        if (kind === "heading" || kind === "bullet") {
            flush();
            const parts = inlineParts(lineText(line, kind));
            if (!parts.length) continue;
            blocks.push({
                type: kind === "heading" ? "heading" : "paragraph",
                parts,
            });
            continue;
        }
        paragraph.push(lineText(line, "text"));
    }
    flush();
    return blocks;
}

export function citationForReference(
    name: string,
    page: number,
    citations: Citation[] | undefined
): Citation {
    const key = name.trim().toLowerCase();
    const sameName = (citations ?? []).filter(
        (entry) => entry.name.trim().toLowerCase() === key
    );
    const exact = sameName.find((entry) => entry.page === page);
    const match = exact ?? sameName[0];
    if (!match) {
        return { documentId: name, name, page, excerpt: "" };
    }
    return { ...match, page };
}

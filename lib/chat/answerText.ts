import type { Citation } from "@/lib/chat/types";

export type AnswerPart =
    | { type: "text"; text: string }
    | { type: "bold"; text: string }
    | { type: "cite"; name: string; page?: number };

export type AnswerBlock =
    | { type: "code"; text: string }
    | { type: "heading"; parts: AnswerPart[] }
    | { type: "paragraph"; parts: AnswerPart[] }
    | { type: "table"; headers: string[]; rows: string[][] };

const EXTENSIONS = "pdf|docx|doc|xlsx|xls|csv|txt|msg|eml";
const FILE_NAME = `[A-Za-z0-9][A-Za-z0-9_.\\- ]{0,160}?\\.(?:${EXTENSIONS})`;
const FILE_NAME_NO_SPACE = `[A-Za-z0-9][A-Za-z0-9_.\\-]{0,160}\\.(?:${EXTENSIONS})\\b`;
const OPEN = "(?:\\*\\*|\\*|`)?";
const CLOSE = "(?:\\*\\*|\\*|`)?";
// "(p. 31)", ", p.80", " page 12"; "pages 88 and 107" links to the first page.
const PAGE = `(?:\\s*\\(\\s*(?:pp?\\.?|pages?)\\s*(\\d+)\\s*\\)|\\s*,?\\s*(?:pp?\\.|pages?\\b)\\s*(\\d+))?\\*?`;
const DOC_ID = /`?\b([A-Za-z]{2,5}\d{5,}(?:_[A-Za-z0-9]+)*)\b`?/g;

type Span = { start: number; end: number; part: AnswerPart };

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pageOf(match: RegExpMatchArray, first: number): number | undefined {
    const raw = match[first] ?? match[first + 1];
    return raw ? Number.parseInt(raw, 10) : undefined;
}

function citeSpans(text: string, sources: string[]): Span[] {
    const spans: Span[] = [];
    const taken = (start: number, end: number) =>
        spans.some((span) => start < span.end && end > span.start);
    const add = (match: RegExpMatchArray, name: string, page?: number) => {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (taken(start, end)) return;
        spans.push({ start, end, part: { type: "cite", name, page } });
    };

    const known = [...new Set(sources.filter(Boolean))].sort(
        (a, b) => b.length - a.length
    );
    if (known.length) {
        const pattern = new RegExp(
            `${OPEN}(${known.map(escapeRegExp).join("|")})${CLOSE}${PAGE}`,
            "gi"
        );
        for (const match of text.matchAll(pattern)) {
            const name =
                known.find((entry) => entry.toLowerCase() === match[1].toLowerCase()) ??
                match[1];
            add(match, name, pageOf(match, 2));
        }
    }
    for (const match of text.matchAll(
        new RegExp(`${OPEN}(${FILE_NAME_NO_SPACE})${CLOSE}${PAGE}`, "gi")
    )) {
        add(match, match[1].trim(), pageOf(match, 2));
    }
    for (const match of text.matchAll(
        new RegExp(`\\*?(${FILE_NAME})\\s*,\\s*p\\.?\\s*(\\d+)\\*?`, "gi")
    )) {
        add(match, match[1].trim(), Number.parseInt(match[2], 10));
    }
    if (known.length) {
        const byStem = new Map(
            known.map((name) => [name.replace(/\.[^.]+$/, "").toLowerCase(), name])
        );
        for (const match of text.matchAll(DOC_ID)) {
            const token = match[1].toLowerCase();
            const stem = [...byStem.keys()].find(
                (key) => token === key || token.startsWith(`${key}_`)
            );
            if (stem) add(match, byStem.get(stem)!);
        }
    }
    return spans.sort((a, b) => a.start - b.start);
}

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

export function inlineParts(text: string, sources: string[] = []): AnswerPart[] {
    const parts: AnswerPart[] = [];
    let last = 0;
    for (const span of citeSpans(text, sources)) {
        if (span.start > last) {
            parts.push(...emphasisParts(text.slice(last, span.start)));
        }
        parts.push(span.part);
        last = span.end;
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
    if (/^(?:#{1,6}\s+|#{2,6}(?=[^#\s]))/.test(trimmed)) return "heading";
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
        return trimmed.replace(/^(?:#{1,6}\s+|#{2,6}(?=[^#\s]))/, "").replace(/\*\*/g, "");
    }
    if (kind === "bullet") {
        return trimmed.replace(/^(?:[-*]|\d+[.)])\s+/, "");
    }
    return trimmed;
}

function tableCells(line: string): string[] {
    let text = line.trim();
    if (text.startsWith("|")) text = text.slice(1);
    if (text.endsWith("|")) text = text.slice(0, -1);
    return text.split("|").map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
    if (!line.includes("|")) return false;
    return tableCells(line).length >= 2;
}

function isTableSeparator(line: string): boolean {
    const cells = tableCells(line);
    return (
        cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
    );
}

export function tableCsv(headers: string[], rows: string[][]): string {
    const escape = (value: string) => {
        const numeric = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim());
        const safe = !numeric && /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
        return `"${safe.replace(/"/g, '""')}"`;
    };
    return [headers, ...rows]
        .map((row) => row.map((cell) => escape(cell)).join(","))
        .join("\n");
}

/** `sources` are the answer's cited file names; mentions of them become links. */
export function parseAnswer(content: string, sources: string[] = []): AnswerBlock[] {
    const blocks: AnswerBlock[] = [];
    let paragraph: string[] = [];
    const lines = content.replace(/\r\n/g, "\n").split("\n");

    const flush = () => {
        const text = paragraph.join(" ").trim();
        paragraph = [];
        if (!text) return;
        const parts = inlineParts(text, sources);
        if (parts.length) blocks.push({ type: "paragraph", parts });
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const next = lines[index + 1] ?? "";
        const fence = line.trim().match(/^(`{3,}|~{3,})/);
        if (fence) {
            flush();
            const code: string[] = [];
            index += 1;
            while (index < lines.length && !lines[index].trim().startsWith(fence[1])) {
                code.push(lines[index]);
                index += 1;
            }
            blocks.push({ type: "code", text: code.join("\n") });
            continue;
        }
        if (isTableRow(line) && isTableSeparator(next)) {
            flush();
            const headers = tableCells(line);
            const rows: string[][] = [];
            index += 2;
            while (index < lines.length && isTableRow(lines[index])) {
                const cells = tableCells(lines[index]);
                rows.push(
                    headers.map((_, column) => cells[column] ?? "")
                );
                index += 1;
            }
            index -= 1;
            if (rows.length) blocks.push({ type: "table", headers, rows });
            continue;
        }
        const kind = lineKind(line);
        if (kind === "blank" || kind === "rule") {
            flush();
            continue;
        }
        if (kind === "heading" || kind === "bullet") {
            flush();
            const parts = inlineParts(lineText(line, kind), sources);
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
    page: number | undefined,
    citations: Citation[] | undefined
): Citation {
    const key = name.trim().toLowerCase();
    const sameName = (citations ?? []).filter(
        (entry) => entry.name.trim().toLowerCase() === key
    );
    const exact = page ? sameName.find((entry) => entry.page === page) : undefined;
    const match = exact ?? sameName[0];
    if (!match) {
        return { documentId: name, name, page: page ?? 1, excerpt: "" };
    }
    return { ...match, page: page ?? match.page };
}

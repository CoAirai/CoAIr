/** Match only words present on the source page; offsets always refer to that page. */
type Word = { value: string; start: number; end: number };
export type SourceHighlight = { start: number; end: number };
const MAX_CHARS = 260;
const MAX_WORDS = 36;
const COMMON = new Set("a an and are as at be been by for from has have in is it of on or that the this to was were with".split(" "));
function words(text: string): Word[] {
    return [...text.matchAll(/[\p{L}\p{N}]+(?:[-‐‑]\s*\n\s*[\p{L}\p{N}]+)*/gu)].map(m => ({
        value: m[0].replace(/[-‐‑]\s*\n\s*/g, "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase(),
        start: m.index!, end: m.index! + m[0].length,
    }));
}
function matchPassage(text: string, excerpt: string, focus: string, fromAnswer = false): SourceHighlight | null {
    const page = words(text), quote = words(excerpt);
    if (!page.length || !quote.length) return null;
    const focused = new Set(words(focus).map(w => w.value).filter(w => w.length > 2 && !COMMON.has(w)));
    let previous = new Uint32Array(quote.length + 1);
    let best: (SourceHighlight & { score: number }) | null = null;
    // Retain exact contiguous word matches, tolerating punctuation, case and OCR line wraps.
    for (let i = 0; i < page.length; i++) {
        const current = new Uint32Array(quote.length + 1);
        for (let j = 0; j < quote.length; j++) {
            if (page[i].value !== quote[j].value) continue;
            const length = previous[j] + 1;
            current[j + 1] = length;
            const fullShortQuote = !fromAnswer && length === quote.length && excerpt.trim().length <= MAX_CHARS;
            if (!fullShortQuote && length < 4) continue;
            let start = Math.max(i - length + 1, i - MAX_WORDS + 1);
            while (start < i && page[i].end - page[start].start > MAX_CHARS) start++;
            if (page[i].end - page[start].start > MAX_CHARS) continue;
            const matched = page.slice(start, i + 1);
            const meaningful = matched.filter(w => w.value.length > 2 && !COMMON.has(w.value));
            if (meaningful.length < (fromAnswer ? 2 : 1)) continue;
            // A tiny quote must identify one occurrence; otherwise it is ambiguous.
            if (fullShortQuote && quote.length < 4) {
                let occurrences = 0;
                for (let p = 0; p <= page.length - quote.length; p++) {
                    if (quote.every((w, k) => w.value === page[p + k].value)) occurrences++;
                }
                if (occurrences !== 1) continue;
            }
            const overlap = new Set(matched.filter(w => focused.has(w.value)).map(w => w.value)).size;
            const score = overlap * 100 + matched.length + (fullShortQuote ? 1 : 0);
            if (!best || score > best.score) best = { start: page[start].start, end: page[i].end, score };
        }
        previous = current;
    }
    return best ? { start: best.start, end: best.end } : null;
}

export function sourceHighlight(text: string, excerpt: string, focus = ""): SourceHighlight | null {
    // Saved citation previews may contain only the chunk's header. Match the
    // clicked claim against the authenticated source page before using that preview.
    const supporting = focus.trim() ? matchPassage(text, focus, focus, true) : null;
    if (supporting) {
        let start = 0, end = text.length;
        for (const boundary of text.matchAll(/[.!?](?:\s|$)|\n\s*\n/g)) {
            const after = boundary.index! + boundary[0].length;
            if (after <= supporting.start) start = after;
            else if (boundary.index! >= supporting.end) { end = after; break; }
        }
        while (start < end && /\s/.test(text[start])) start++;
        while (end > start && /\s/.test(text[end - 1])) end--;
        if (end - start <= MAX_CHARS) return { start, end };
        return supporting;
    }
    return matchPassage(text, excerpt, focus);
}

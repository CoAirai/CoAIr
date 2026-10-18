export type CoairEvidenceRaw = {
    source_id?: string;
    doc_id?: string;
    file_name?: string;
    title?: string;
    document_date?: string;
    page?: number | null;
    kind?: string;
    sender?: string;
    recipient?: string;
    sheet?: string;
    row_from?: number | null;
    row_to?: number | null;
    excerpt?: string;
};

export type CoairClaimRaw = {
    text?: string;
    source_ids?: string[];
    is_inference?: boolean;
    inference_basis?: string;
};

export type CoairEntryRaw = {
    entry_ref?: string;
    event_date?: string;
    date?: string;
    date_precision?: string;
    date_source?: string;
    heading?: string;
    title?: string;
    parties?: string[];
    event_type?: string;
    claims?: CoairClaimRaw[];
};

export type CoairReviewRaw = { by?: string; at?: string };

export type DelayBasis = "N" | "I" | "H" | "P" | "D" | "T";

export const DELAY_BASIS_LABEL: Record<DelayBasis, string> = {
    N: "Notice",
    I: "Instruction",
    H: "Hold",
    P: "Programme",
    D: "Determination",
    T: "Time language",
};

export type ChronologyEventSource = {
    srcId: string;
    documentId: string;
    name: string;
    title: string;
    page: number;
    excerpt: string;
    pinpoint: string;
};

export type ChronologyEventClaim = {
    text: string;
    inference?: string;
    sources: ChronologyEventSource[];
};

export type ChronologyEvent = {
    ref: string;
    eventId: string;
    date: string;
    dateLabel: string;
    dateInferred: boolean;
    summary: string;
    claims: ChronologyEventClaim[];
    docType: string;
    parties: string;
    sources: ChronologyEventSource[];
    delay: { basis: DelayBasis; label: string; evidence: string } | null;
    reviewed: boolean;
    reviewedBy?: string;
    reviewedAt?: string;
};

type DocCode =
    | "INSTRUCTION" | "VARIATION" | "NOTICE" | "DETERMINATION" | "RFI" | "NCR"
    | "MINUTES" | "PROGRESS_REPORT" | "SITE_DIARY" | "PROGRAMME" | "SPECIFICATION"
    | "SUBMITTAL" | "PURCHASE_ORDER" | "REGISTER" | "DRAWING" | "EMAIL" | "LETTER"
    | "PAYMENT_CERT" | "PHOTOGRAPH" | "CONTRACT" | "REPORT" | "OTHER";

const DOC_LABEL: Record<DocCode, string> = {
    INSTRUCTION: "Instruction",
    VARIATION: "Variation",
    NOTICE: "Notice",
    DETERMINATION: "Determination",
    RFI: "RFI",
    NCR: "NCR",
    MINUTES: "Minutes",
    PROGRESS_REPORT: "Progress report",
    SITE_DIARY: "Site diary",
    PROGRAMME: "Programme",
    SPECIFICATION: "Specification",
    SUBMITTAL: "Submittal",
    PURCHASE_ORDER: "Purchase order",
    REGISTER: "Register",
    DRAWING: "Drawing",
    EMAIL: "Email",
    LETTER: "Letter",
    PAYMENT_CERT: "Payment certificate",
    PHOTOGRAPH: "Photograph",
    CONTRACT: "Contract",
    REPORT: "Report",
    OTHER: "Document",
};

const DOC_RULES: [RegExp, DocCode][] = [
    [/\b(ins|ai|ei)-?\d|\binstruction\b/, "INSTRUCTION"],
    [/\bvo-?\d|\bvariation\b|\bchange (order|notice)\b|\bintc\b/, "VARIATION"],
    [/\bnot-?\d|\bnotice\b|\bnotification\b/, "NOTICE"],
    [/\bdet-?\d|\bdetermination\b/, "DETERMINATION"],
    [/\brfi-?\d|request for information/, "RFI"],
    [/\bncr-?\d|non-?conformance/, "NCR"],
    [/\bmom-?\d|\bminutes\b/, "MINUTES"],
    [/\bmpr-?\d|progress report|period report/, "PROGRESS_REPORT"],
    [/site diary|daily report/, "SITE_DIARY"],
    [/\bprg-?\d|\bprogramme\b|\bschedule\b/, "PROGRAMME"],
    [/\bspecification\b/, "SPECIFICATION"],
    [/\bsubmittal\b/, "SUBMITTAL"],
    [/\bpurchase order\b/, "PURCHASE_ORDER"],
    [/\bregister\b|\btracker\b/, "REGISTER"],
    [/\bdrawing\b|\.dwg\b/, "DRAWING"],
    [/\.eml\b|\.msg\b|\bemail\b|\be-mail\b|^from:|\bsent:/, "EMAIL"],
    [/\bletter\b|\bltr-?\d|\bdear\b/, "LETTER"],
    [/payment cert|\bvaluation\b/, "PAYMENT_CERT"],
    [/\.jpe?g\b|\.png\b|\bphotograph/, "PHOTOGRAPH"],
    [/\bcontract\b|\bagreement\b|\bdeed\b/, "CONTRACT"],
    [/\breport\b|\breview\b|\bpaper\b/, "REPORT"],
];

export function inferDocType(text: string): DocCode {
    const lower = text.toLowerCase();
    for (const [pattern, code] of DOC_RULES) {
        if (pattern.test(lower)) return code;
    }
    return "OTHER";
}

type DelayRule = { basis: DelayBasis; patterns: RegExp[] };

// Order matters: a notice that also uses time language is a Notice.
const DELAY_RULES: DelayRule[] = [
    {
        basis: "N",
        patterns: [
            /\bnotice of delay\b/i,
            /\bsub-?clause 20\.1\b/i,
            /\bextension of time\b.*\b(claim|submission|application)\b/i,
            /\bEoT\b/,
        ],
    },
    {
        basis: "I",
        patterns: [
            /\binstruct(ed|ion)\b/i,
            /\bvariation (order|instruction)\b/i,
            /\bchange of (scope|specification|finish)\b/i,
            /\bsupersedes rev\b/i,
        ],
    },
    {
        basis: "H",
        patterns: [
            /\bsuspend(ed|sion)\b/i,
            /\bstood down\b/i,
            /\bon hold\b/i,
            /\bawaiting approval\b/i,
            /\bwork(s)? stopped\b/i,
            /\bheld pending\b/i,
        ],
    },
    {
        basis: "P",
        patterns: [
            /\bre-?sequenc/i,
            /\brevised programme\b/i,
            /\blead time\b/i,
            /\bagainst (the )?(baseline|plan(ned)?)\b/i,
            /\bslipp(age|ed)\b/i,
        ],
    },
    {
        basis: "D",
        patterns: [
            /\bdetermin(es|ation|ed)\b/i,
            /\bsub-?clause 3\.5\b/i,
            /\b(no|an) extension of time is (due|granted)\b/i,
        ],
    },
    {
        basis: "T",
        patterns: [
            /\bcritical (path|to)\b/i,
            /\bprolongation\b/i,
            /\bdelay(ed|s)? (to|the) (completion|works|programme)\b/i,
            /\btime[- ]related\b/i,
        ],
    },
];

/** Marks wording that bears on time; it is not a finding that delay occurred. */
export function detectDelayBasis(text: string): { basis: DelayBasis; evidence: string } | null {
    for (const rule of DELAY_RULES) {
        for (const pattern of rule.patterns) {
            const match = text.match(pattern);
            if (match) return { basis: rule.basis, evidence: match[0] };
        }
    }
    return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatEventDate(raw: string, precision = ""): string {
    const value = raw.trim();
    const match = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!match) return value || "Date not established";
    const [, year, month, day] = match;
    const monthName = month ? MONTHS[Number(month) - 1] : "";
    if (precision === "year" || !month) return year;
    if (precision === "quarter") return `Q${Math.ceil(Number(month) / 3)} ${year}`;
    if (precision === "month" || !day) return `${monthName} ${year}`;
    return `${day} ${monthName} ${year}`;
}

export function summarise(text: string, limit = 90): string {
    const first = text
        .split(/(?<=\.)\s/)[0]
        .replace(/^On \d{1,2}(st|nd|rd|th)? \w+ \d{4},?\s*/i, "")
        .replace(/^\w/, (c) => c.toUpperCase());
    if (first.length <= limit) return first.replace(/\.$/, "");
    return `${first.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`;
}

function humanise(value: string): string {
    const clean = value.replace(/[_-]+/g, " ").trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function toSource(item: CoairEvidenceRaw, index: number): ChronologyEventSource {
    const page = item.page ?? 1;
    const rows =
        item.sheet && item.row_from
            ? `${item.sheet} row ${item.row_from}${item.row_to && item.row_to !== item.row_from ? `–${item.row_to}` : ""}`
            : "";
    return {
        srcId: item.source_id || `src_${index}`,
        documentId: item.doc_id || item.file_name || "",
        name: item.file_name || item.title || item.doc_id || "Source",
        title: item.title || "",
        page,
        excerpt: item.excerpt || "",
        pinpoint: rows || `p.${page}`,
    };
}

export function isOverviewEntry(entry: CoairEntryRaw): boolean {
    return (entry.event_type || "").toLowerCase() === "overview";
}

export function buildChronologyEvents(
    entries: CoairEntryRaw[],
    evidence: CoairEvidenceRaw[],
    reviews: Record<string, CoairReviewRaw> = {}
): { overview: ChronologyEventClaim[]; events: ChronologyEvent[] } {
    const sourceById = new Map(
        evidence.map((item, index) => [item.source_id || `src_${index}`, toSource(item, index)])
    );
    const rawById = new Map(evidence.map((item, index) => [item.source_id || `src_${index}`, item]));
    const claimsOf = (entry: CoairEntryRaw): ChronologyEventClaim[] =>
        (entry.claims ?? [])
            .filter((claim) => (claim.text ?? "").trim())
            .map((claim) => ({
                text: (claim.text ?? "").trim(),
                inference: claim.is_inference ? claim.inference_basis || "Inferred" : undefined,
                sources: (claim.source_ids ?? [])
                    .map((id) => sourceById.get(id))
                    .filter((source): source is ChronologyEventSource => Boolean(source)),
            }));

    const overview = entries.filter(isOverviewEntry).flatMap(claimsOf);
    const dated = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => !isOverviewEntry(entry))
        .map(({ entry, index }) => ({
            entry,
            index,
            date: (entry.event_date || entry.date || "").trim(),
        }))
        .sort((a, b) => {
            if (!a.date !== !b.date) return a.date ? -1 : 1;
            return a.date.localeCompare(b.date) || a.index - b.index;
        });

    const events = dated.map(({ entry, index, date }, position): ChronologyEvent => {
        const claims = claimsOf(entry);
        const text = claims.map((claim) => claim.text).join(" ");
        const sources = [
            ...new Map(
                claims.flatMap((claim) => claim.sources).map((source) => [source.srcId, source])
            ).values(),
        ];
        const primary = sources[0] ? rawById.get(sources[0].srcId) : undefined;
        const docHint = [primary?.title, primary?.file_name, primary?.excerpt?.slice(0, 160)]
            .filter(Boolean)
            .join(" ");
        const code: DocCode =
            primary?.kind === "email" ? "EMAIL" : primary?.kind === "excel" ? "REGISTER" : inferDocType(docHint);
        const eventType = (entry.event_type || "").trim();
        const docType =
            code === "OTHER" && eventType && eventType.toLowerCase() !== "event"
                ? humanise(eventType)
                : DOC_LABEL[code];
        const detected = detectDelayBasis(text);
        const parties =
            primary?.sender || primary?.recipient
                ? `${primary?.sender || "—"} → ${primary?.recipient || "—"}`
                : (entry.parties ?? []).filter(Boolean).join(", ");
        const ref = entry.entry_ref || `entry-${index}`;
        const review = reviews[ref];
        return {
            ref,
            eventId: `EV-${String(position + 1).padStart(4, "0")}`,
            date,
            dateLabel: date ? formatEventDate(date, entry.date_precision) : "Date not established",
            dateInferred:
                /infer/i.test(entry.date_source || "") ||
                (claims.length > 0 && claims.every((claim) => claim.inference)),
            summary: summarise(claims[0]?.text || entry.heading || entry.title || "Event"),
            claims,
            docType,
            parties,
            sources,
            delay: detected
                ? { basis: detected.basis, label: DELAY_BASIS_LABEL[detected.basis], evidence: detected.evidence }
                : null,
            reviewed: Boolean(review),
            reviewedBy: review?.by,
            reviewedAt: review?.at,
        };
    });

    return { overview, events };
}

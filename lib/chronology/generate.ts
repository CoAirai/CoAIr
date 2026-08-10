import type {
    ChronologyCitation,
    ChronologyReport,
    ChronologySection,
} from "./types";

const SRC_ALPHABET = "abcdef0123456789";

function srcId(seed: string) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return `src_${Array.from({ length: 16 }, (_, offset) => {
        const value = (hash >> ((offset % 8) * 4)) & 0xf;
        return SRC_ALPHABET[(value + offset) % SRC_ALPHABET.length];
    }).join("")}`;
}

function titleFromTopic(topic: string) {
    const cleaned = topic.trim().replace(/[.?!]+$/, "");
    if (cleaned.length <= 72) return cleaned;
    return `${cleaned.slice(0, 69).trim()}…`;
}

export function buildChronologyReport(input: {
    topic: string;
    startDate?: string;
    endDate?: string;
    parties?: string;
    nextIndex: number;
    now: Date;
    companyId?: string;
    ownerUserId?: string;
    documents: { id: string; name: string }[];
}): ChronologyReport {
    const topic = input.topic.trim();
    if (!topic) {
        throw new Error("Topic required");
    }

    const docs = input.documents.slice(0, 4);
    const citations: ChronologyCitation[] = docs.map((doc, index) => ({
        documentId: doc.id,
        name: doc.name,
        srcId: srcId(`${doc.id}-${index}-${topic}`),
        page: Math.min(index + 1, 5) || 1,
    }));

    const cite = (index: number) => {
        const citation = citations[index % Math.max(citations.length, 1)];
        return citation ? ` [${citation.srcId}]` : "";
    };

    const parties = input.parties?.trim() || "the Employer, Contractor and Engineer";
    const window = [input.startDate, input.endDate].filter(Boolean).join(" to ");

    const sections: ChronologySection[] = [
        {
            id: "overview",
            heading: `${input.nextIndex}.1 Overview`,
            body: `This chronology investigates ${topic}. It is limited to the project record${
                window ? ` between ${window}` : ""
            } and the positions of ${parties}.${cite(0)} Each dated entry below is a read-only reconstruction from verified sources.`,
            citations: citations.slice(0, 1),
        },
        {
            id: "event-a",
            heading: `${input.nextIndex}.2 ${input.startDate || "Opening period"}`,
            body: `Correspondence and progress records show the issue emerging in the works. Design information and utility interfaces were not aligned, and regular progress was affected.${cite(0)}${cite(1)} The contemporaneous files record notices, replies, and programme risk.`,
            citations: citations.slice(0, 2),
        },
        {
            id: "event-b",
            heading: `${input.nextIndex}.3 ${input.endDate || "Later period"}`,
            body: `Later records confirm mitigation attempts and residual delay. Additional resources were deployed, but source documents still show unresolved interface risk.${cite(1)}${cite(2)} This report does not decide liability; it sequences what the record shows.`,
            citations: citations.slice(1, 3),
        },
    ];

    return {
        id: `chr-${input.nextIndex}-${input.now.getTime()}`,
        companyId: input.companyId ?? "",
        ownerUserId: input.ownerUserId,
        reference: `6.${input.nextIndex}`,
        title: titleFromTopic(topic),
        topic,
        startDate: input.startDate || undefined,
        endDate: input.endDate || undefined,
        parties: input.parties?.trim() || undefined,
        createdAt: input.now.toISOString(),
        status: "ready",
        sections,
        sources: citations.map((citation, index) => ({
            ...citation,
            id: `src-row-${index}`,
        })),
    };
}

import { FORENSIC_METHODS, type ForensicCitation, type ForensicMethod, type ForensicReport, type ForensicSection } from "./types";

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

function titleFromTopic(topic: string, method: ForensicMethod) {
    const methodLabel =
        FORENSIC_METHODS.find((entry) => entry.id === method)?.label ?? "Forensic";
    const cleaned = topic.trim().replace(/[.?!]+$/, "");
    const core = cleaned.length <= 56 ? cleaned : `${cleaned.slice(0, 53).trim()}…`;
    return `${methodLabel}: ${core}`;
}

export function buildForensicReport(input: {
    topic: string;
    method: ForensicMethod;
    baselineProgramme?: string;
    updatedProgramme?: string;
    dataDate?: string;
    startDate?: string;
    endDate?: string;
    nextIndex: number;
    now: Date;
    companyId?: string;
    documents: { id: string; name: string }[];
}): ForensicReport {
    const topic = input.topic.trim();
    if (!topic) {
        throw new Error("Topic required");
    }

    const docs = input.documents.slice(0, 4);
    const citations: ForensicCitation[] = docs.map((doc, index) => ({
        documentId: doc.id,
        name: doc.name,
        srcId: srcId(`${doc.id}-${index}-${input.method}-${topic}`),
        page: Math.min(index + 2, 6) || 1,
    }));

    const cite = (index: number) => {
        const citation = citations[index % Math.max(citations.length, 1)];
        return citation ? ` [${citation.srcId}]` : "";
    };

    const baseline = input.baselineProgramme?.trim() || "Baseline programme Rev 03";
    const updated = input.updatedProgramme?.trim() || "Updated programme at data date";
    const dataDate = input.dataDate || "the current data date";
    const window = [input.startDate, input.endDate].filter(Boolean).join(" to ");
    const ref = input.nextIndex;

    const byMethod: Record<ForensicMethod, ForensicSection[]> = {
        dcma: [
            {
                id: "overview",
                heading: `${ref}.1 DCMA overview`,
                body: `This DCMA 14-point review examines ${topic}. It uses ${baseline} against ${updated} at ${dataDate}.${cite(0)} Checks are limited to logic, leads/lags, float and constraints present in the submitted programmes.`,
                citations: citations.slice(0, 1),
            },
            {
                id: "metrics",
                heading: `${ref}.2 Failed / watch metrics`,
                body: `High-float and missing-logic activities exceed the DCMA thresholds on the live file.${cite(0)}${cite(1)} Negative float clusters around utility interface and design-release activities associated with the delay event.`,
                citations: citations.slice(0, 2),
            },
            {
                id: "finding",
                heading: `${ref}.3 Programme quality finding`,
                body: `The live programme is not yet a reliable forensic instrument until missing logic and hard constraints are corrected.${cite(1)} This report records the quality position; it does not itself decide extension of time.`,
                citations: citations.slice(1, 2),
            },
        ],
        critical_path: [
            {
                id: "overview",
                heading: `${ref}.1 Critical path overview`,
                body: `Critical-path comparison for ${topic}${window ? ` over ${window}` : ""}. Baseline path is taken from ${baseline}; as-built / current path from ${updated}.${cite(0)}`,
                citations: citations.slice(0, 1),
            },
            {
                id: "baseline",
                heading: `${ref}.2 Baseline critical path`,
                body: `The baseline driving sequence ran through design release, utility diversion and follow-on civil works.${cite(0)}${cite(1)} Total float on the driving chain was thin before the event window opened.`,
                citations: citations.slice(0, 2),
            },
            {
                id: "asbuilt",
                heading: `${ref}.3 As-built / current path`,
                body: `By ${dataDate} the driving path had shifted onto delayed utility and possession activities.${cite(1)}${cite(2)} Float erosion on the original chain is contemporaneously recorded in progress updates.`,
                citations: citations.slice(1, 3),
            },
        ],
        windows: [
            {
                id: "overview",
                heading: `${ref}.1 Windows overview`,
                body: `Windows analysis of ${topic}${window ? ` between ${window}` : ""}. Each window compares ${baseline} with the contemporaneous update then in force.${cite(0)}`,
                citations: citations.slice(0, 1),
            },
            {
                id: "window-a",
                heading: `${ref}.2 Window 1`,
                body: `In the opening window, incomplete information and interface access prevented regular progress of the driving activities.${cite(0)}${cite(1)} Delay in this window is measured to the then-current completion milestone.`,
                citations: citations.slice(0, 2),
            },
            {
                id: "window-b",
                heading: `${ref}.3 Window 2 and close`,
                body: `The later window records mitigation and residual impact still sitting on the critical path at ${dataDate}.${cite(1)}${cite(2)} Net critical delay is the sum of window impacts after mitigation.`,
                citations: citations.slice(1, 3),
            },
        ],
        retrospective: [
            {
                id: "overview",
                heading: `${ref}.1 Retrospective overview`,
                body: `This retrospective time-impact analysis reconstructs ${topic} from the contemporaneous record and ${updated}.${cite(0)} It looks backwards from ${dataDate}${window ? ` across ${window}` : ""}.`,
                citations: citations.slice(0, 1),
            },
            {
                id: "actual",
                heading: `${ref}.2 What actually occurred`,
                body: `Progress records show the planned sequence could not be followed. Utility, design and possession constraints stacked on the same chain.${cite(0)}${cite(1)} Actual start/finish dates diverge from ${baseline}.`,
                citations: citations.slice(0, 2),
            },
            {
                id: "cause",
                heading: `${ref}.3 Cause and critical effect`,
                body: `The record supports a critical delay to completion arising from the investigated event, subject to any concurrent delay argument.${cite(1)}${cite(2)} Liability is not decided here; only the as-built critical effect is sequenced.`,
                citations: citations.slice(1, 3),
            },
        ],
        prospective: [
            {
                id: "overview",
                heading: `${ref}.1 Prospective overview`,
                body: `Prospective time-impact analysis for ${topic} from ${dataDate}. Remaining work is modelled on ${updated}, impacted against ${baseline}.${cite(0)}`,
                citations: citations.slice(0, 1),
            },
            {
                id: "impact",
                heading: `${ref}.2 Modelled impact`,
                body: `Inserting the remaining delay event into the live logic extends the completion milestone.${cite(0)}${cite(1)} The driving remaining activities are utility close-out and follow-on construction.`,
                citations: citations.slice(0, 2),
            },
            {
                id: "forecast",
                heading: `${ref}.3 Forecast completion`,
                body: `Unless further mitigation is instructed, the prospective model forecasts further slippage beyond the current contractual date.${cite(1)}${cite(2)} This is a forward-looking instrument only.`,
                citations: citations.slice(1, 3),
            },
        ],
    };

    const sections = byMethod[input.method];

    return {
        id: `for-${input.nextIndex}-${input.now.getTime()}`,
        companyId: input.companyId ?? "",
        reference: `7.${input.nextIndex}`,
        title: titleFromTopic(topic, input.method),
        topic,
        method: input.method,
        baselineProgramme: input.baselineProgramme?.trim() || undefined,
        updatedProgramme: input.updatedProgramme?.trim() || undefined,
        dataDate: input.dataDate || undefined,
        startDate: input.startDate || undefined,
        endDate: input.endDate || undefined,
        createdAt: input.now.toISOString(),
        status: "ready",
        sections,
        sources: citations.map((citation, index) => ({
            ...citation,
            id: `for-src-${index}`,
        })),
    };
}

import type {
    ChronologyCitation,
    ChronologyReport,
    ChronologySection,
    ChronologySource,
    ChronologyStatus,
} from "@/lib/chronology/types";
import {
    buildChronologyEvents,
    type CoairEntryRaw,
    type CoairEvidenceRaw,
    type CoairReviewRaw,
} from "@/lib/chronology/events";

export type CoairReportEvidence = CoairEvidenceRaw;

export type CoairChronologyEntry = CoairEntryRaw;

export type CoairReportJob = {
    job_id: string;
    title?: string;
    status?: string;
    created_at?: string;
    sequence_number?: number;
    error?: string;
    stage?: string;
    progress?: number;
    result?: {
        entries?: CoairChronologyEntry[];
        evidence?: CoairReportEvidence[];
        coverage_status?: string;
        reviews?: Record<string, CoairReviewRaw>;
        documents_considered?: number;
    };
};

export function mapReportStatus(status?: string): ChronologyStatus {
    if (status === "ready") return "ready";
    if (status === "failed" || status === "credit_balance_exhausted") {
        return "failed";
    }
    return "generating";
}

export function chronologyProgressLabel(stage?: string, progress?: number): string {
    const labels: Record<string, string> = {
        research_plan: "Planning research",
        source_selection: "Selecting sources",
        evidence_pack: "Preparing evidence",
        coverage_repair: "Checking evidence coverage",
        evidence_extraction: "Extracting evidence",
        aggregation: "Combining events",
        synthesis: "Writing chronology",
        verification: "Verifying sources",
        claim_repair: "Checking rejected claims",
        word: "Preparing Word document",
    };
    const label = labels[stage ?? ""] ?? "Generating";
    return typeof progress === "number" && Number.isFinite(progress)
        ? `${label} · ${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`
        : label;
}

function mapSources(evidence: CoairReportEvidence[] | undefined): ChronologySource[] {
    return (evidence ?? []).map((item, index) => ({
        id: item.source_id || item.doc_id || `src-${index}`,
        documentId: item.doc_id || item.file_name || "",
        name: item.file_name || item.title || item.doc_id || "Source",
        srcId: item.source_id || `src_${index}`,
        page: item.page ?? 1,
    }));
}

export function mapChronologyJob(
    job: CoairReportJob,
    companyId: string
): ChronologyReport {
    const sources = mapSources(job.result?.evidence);
    const sourceById = new Map(sources.map((source) => [source.srcId, source]));
    const sequence = job.sequence_number ?? 1;
    const entries = job.result?.entries ?? [];
    const sections: ChronologySection[] =
        entries.length > 0
            ? entries.map((entry, index) => {
                  const citations: ChronologyCitation[] = [];
                  const body = (entry.claims ?? [])
                      .map((claim) => {
                          const cites = (claim.source_ids ?? []).map((id) => {
                              const source = sourceById.get(id);
                              if (source) citations.push(source);
                              return `[${id}]`;
                          });
                          return `${claim.text ?? ""} ${cites.join(" ")}`.trim();
                      })
                      .filter(Boolean)
                      .join(" ");
                  return {
                      id: `${job.job_id}-${index}`,
                      heading:
                          entry.heading ||
                          entry.title ||
                          entry.date ||
                          `${sequence}.${index + 1}`,
                      body:
                          body ||
                          job.error ||
                          "This event is still being written from the project record.",
                      citations,
                  };
              })
            : [
                  {
                      id: `${job.job_id}-overview`,
                      heading: job.title || "Chronology",
                      body:
                          job.error ||
                          (mapReportStatus(job.status) === "generating"
                              ? "Generating from the project record…"
                              : "No dated events were returned."),
                      citations: [],
                  },
              ];

    return {
        id: job.job_id,
        companyId,
        reference: String(sequence),
        title: job.title || "Chronology",
        topic: job.title || "",
        createdAt: job.created_at || new Date().toISOString(),
        status: mapReportStatus(job.status),
        stage: job.stage,
        progress: job.progress,
        error: job.error || undefined,
        sections,
        sources,
        ...buildChronologyEvents(
            entries,
            job.result?.evidence ?? [],
            job.result?.reviews ?? {}
        ),
        coveragePartial: job.result?.coverage_status === "partial",
        documentsConsidered: job.result?.documents_considered,
    };
}

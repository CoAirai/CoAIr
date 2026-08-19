import type {
    ChronologyCitation,
    ChronologyReport,
    ChronologySection,
    ChronologySource,
    ChronologyStatus,
} from "@/lib/chronology/types";

export type CoairReportEvidence = {
    source_id?: string;
    doc_id?: string;
    file_name?: string;
    title?: string;
    page?: number | null;
};

export type CoairChronologyEntry = {
    date?: string;
    heading?: string;
    title?: string;
    claims?: Array<{ text?: string; source_ids?: string[] }>;
};

export type CoairReportJob = {
    job_id: string;
    title?: string;
    status?: string;
    created_at?: string;
    sequence_number?: number;
    error?: string;
    result?: {
        entries?: CoairChronologyEntry[];
        evidence?: CoairReportEvidence[];
    };
};

export function mapReportStatus(status?: string): ChronologyStatus {
    if (status === "ready") return "ready";
    if (status === "failed" || status === "credit_balance_exhausted") {
        return "failed";
    }
    return "generating";
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
        sections,
        sources,
    };
}

import type { ChronologyEvent, ChronologyEventClaim } from "./events";

export type ChronologyStatus = "ready" | "failed" | "generating";

export type ChronologyCitation = {
    documentId: string;
    name: string;
    srcId: string;
    page: number;
};

export type ChronologySection = {
    id: string;
    heading: string;
    body: string;
    citations: ChronologyCitation[];
};

export type ChronologySource = ChronologyCitation & {
    id: string;
};

export type ChronologyReport = {
    id: string;
    companyId: string;
    ownerUserId?: string;
    reference: string;
    title: string;
    topic: string;
    startDate?: string;
    endDate?: string;
    parties?: string;
    createdAt: string;
    status: ChronologyStatus;
    error?: string;
    sections: ChronologySection[];
    sources: ChronologySource[];
    events?: ChronologyEvent[];
    overview?: ChronologyEventClaim[];
    coveragePartial?: boolean;
    documentsConsidered?: number;
};

export type ChronologyDraft = {
    topic: string;
    startDate?: string;
    endDate?: string;
    parties?: string;
};

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
    sections: ChronologySection[];
    sources: ChronologySource[];
};

export type ChronologyDraft = {
    topic: string;
    startDate?: string;
    endDate?: string;
    parties?: string;
};

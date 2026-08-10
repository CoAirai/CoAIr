export type ForensicXerFile = {
    id: string;
    companyId: string;
    name: string;
    sizeMb: number;
    addedAt: string;
};

export type ForensicProgrammeWorkspace = {
    id: string;
    companyId: string;
    ownerUserId?: string;
    name: string;
    programmeIds: string[];
    createdAt: string;
};

export type ForensicStatus = "ready" | "failed" | "generating";

export type ForensicMethod =
    | "dcma"
    | "critical_path"
    | "windows"
    | "retrospective"
    | "prospective";

export type ForensicCitation = {
    documentId: string;
    name: string;
    srcId: string;
    page: number;
};

export type ForensicSection = {
    id: string;
    heading: string;
    body: string;
    citations: ForensicCitation[];
};

export type ForensicSource = ForensicCitation & {
    id: string;
};

export type ForensicReport = {
    id: string;
    companyId: string;
    reference: string;
    title: string;
    topic: string;
    method: ForensicMethod;
    baselineProgramme?: string;
    updatedProgramme?: string;
    dataDate?: string;
    startDate?: string;
    endDate?: string;
    createdAt: string;
    status: ForensicStatus;
    sections: ForensicSection[];
    sources: ForensicSource[];
};

export const FORENSIC_METHODS: {
    id: ForensicMethod;
    label: string;
    summary: string;
}[] = [
    {
        id: "dcma",
        label: "DCMA 14-point",
        summary: "Health-check the live programme against DCMA quality metrics.",
    },
    {
        id: "critical_path",
        label: "Critical path",
        summary: "Compare baseline and as-built critical paths and float erosion.",
    },
    {
        id: "windows",
        label: "Windows analysis",
        summary: "Split the delay into successive windows and isolate each impact.",
    },
    {
        id: "retrospective",
        label: "Retrospective TIA",
        summary: "Rebuild what actually delayed the works from the contemporaneous record.",
    },
    {
        id: "prospective",
        label: "Prospective TIA",
        summary: "Model remaining delay and forecast completion from the data date.",
    },
];

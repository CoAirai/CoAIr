import type { ForensicProgrammeWorkspace, ForensicXerFile } from "./types";

export const SEED_FORENSIC_XER_FILES: ForensicXerFile[] = [
    {
        id: "xer-001",
        companyId: "co-001",
        name: "Edinburgh_Tram_Baseline_Rev03.xer",
        sizeMb: 12.4,
        addedAt: "2024-08-01T09:00:00.000Z",
    },
    {
        id: "xer-002",
        companyId: "co-001",
        name: "Edinburgh_Tram_Update_42.xer",
        sizeMb: 14.1,
        addedAt: "2024-08-02T11:30:00.000Z",
    },
];

export const SEED_FORENSIC_PROGRAMME_WORKSPACES: ForensicProgrammeWorkspace[] = [
    {
        id: "fw-tram-01",
        companyId: "co-001",
        ownerUserId: "u-001",
        name: "Tram forensic set",
        programmeIds: ["xer-001", "xer-002"],
        createdAt: "2024-08-03T08:15:00.000Z",
    },
    {
        id: "fw-tram-02",
        companyId: "co-001",
        ownerUserId: "u-002",
        name: "Ben programme set",
        programmeIds: ["xer-002"],
        createdAt: "2024-08-04T10:00:00.000Z",
    },
];

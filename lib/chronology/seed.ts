import type { ChronologyReport } from "./types";

export const SEED_CHRONOLOGY_REPORTS: ChronologyReport[] = [
    {
        id: "chr-27",
        companyId: "co-001",
        ownerUserId: "u-001",
        reference: "6.27",
        title: "Incomplete and Misaligned Design (The SDS Contract)",
        topic: "Incomplete and misaligned design under the SDS contract",
        startDate: "2005-01-01",
        endDate: "2008-12-31",
        parties: "CEC, SDS, Contractor",
        createdAt: "2024-08-12T09:10:00.000Z",
        status: "failed",
        sections: [],
        sources: [],
    },
    {
        id: "chr-26",
        companyId: "co-001",
        ownerUserId: "u-001",
        reference: "6.26",
        title: "Programme Certainty after Design Freeze",
        topic: "Programme certainty after design freeze",
        createdAt: "2024-08-10T11:00:00.000Z",
        status: "ready",
        sections: [
            {
                id: "s1",
                heading: "6.26.1 Overview",
                body: "Design freeze decisions affected downstream utility and construction packages. [src_afaf1a13caf7baeb] The record shows repeated requests for issued-for-construction information.",
                citations: [
                    {
                        documentId: "doc-002",
                        name: "Edinburgh Tram Inquiry extract.pdf",
                        srcId: "src_afaf1a13caf7baeb",
                        page: 1,
                    },
                ],
            },
        ],
        sources: [
            {
                id: "src-row-0",
                documentId: "doc-002",
                name: "Edinburgh Tram Inquiry extract.pdf",
                srcId: "src_afaf1a13caf7baeb",
                page: 1,
            },
        ],
    },
    {
        id: "chr-24",
        companyId: "co-001",
        ownerUserId: "u-001",
        reference: "6.24",
        title: "Utility Diversion Failures (MUDFA)",
        topic: "Utility diversion failures under MUDFA",
        startDate: "2006-02-01",
        endDate: "2008-06-01",
        parties: "CEC, MUDFA, SDS",
        createdAt: "2024-08-04T22:25:32.000Z",
        status: "ready",
        sections: [
            {
                id: "overview",
                heading: "6.24.1 Overview",
                body: "This chronology reconstructs utility diversion failures on the Edinburgh Tram project. [src_afaf1a13caf7baeb] It follows contemporaneous notices, replies and programme updates from the project record.",
                citations: [
                    {
                        documentId: "doc-tram-001",
                        name: "CEC00246714.pdf",
                        srcId: "src_afaf1a13caf7baeb",
                        page: 5,
                    },
                ],
            },
            {
                id: "feb",
                heading: "6.24.2 2006-02-23",
                body: "MUDFA works were not complete in the sections required for follow-on construction. [src_d97d2254bae76779] Incomplete diversions constrained access and delayed regular progress of the Works.",
                citations: [
                    {
                        documentId: "doc-tram-002",
                        name: "CEC00248102.pdf",
                        srcId: "src_d97d2254bae76779",
                        page: 3,
                    },
                ],
            },
            {
                id: "mar",
                heading: "6.24.3 2006-03-28",
                body: "Further correspondence records attempted mitigation and remaining interface risk between utility contractors and the main works. [src_2e77b2a61338aa1f] [src_afaf1a13caf7baeb]",
                citations: [
                    {
                        documentId: "doc-tram-003",
                        name: "CEC00249011.pdf",
                        srcId: "src_2e77b2a61338aa1f",
                        page: 2,
                    },
                    {
                        documentId: "doc-tram-001",
                        name: "CEC00246714.pdf",
                        srcId: "src_afaf1a13caf7baeb",
                        page: 5,
                    },
                ],
            },
        ],
        sources: [
            {
                id: "src-a",
                documentId: "doc-tram-001",
                name: "CEC00246714.pdf",
                srcId: "src_afaf1a13caf7baeb",
                page: 5,
            },
            {
                id: "src-b",
                documentId: "doc-tram-002",
                name: "CEC00248102.pdf",
                srcId: "src_d97d2254bae76779",
                page: 3,
            },
            {
                id: "src-c",
                documentId: "doc-tram-003",
                name: "CEC00249011.pdf",
                srcId: "src_2e77b2a61338aa1f",
                page: 2,
            },
        ],
    },
    {
        id: "chr-23",
        companyId: "co-001",
        ownerUserId: "u-002",
        reference: "6.23",
        title: "Gogar Depot Possession Delay",
        topic: "Gogar depot possession delay",
        createdAt: "2024-07-28T08:00:00.000Z",
        status: "ready",
        sections: [
            {
                id: "s1",
                heading: "6.23.1 Overview",
                body: "Late possession at Gogar depot is recorded against incomplete design information and utility contractor interface. [src_d97d2254bae76779]",
                citations: [
                    {
                        documentId: "doc-tram-002",
                        name: "CEC00248102.pdf",
                        srcId: "src_d97d2254bae76779",
                        page: 3,
                    },
                ],
            },
        ],
        sources: [
            {
                id: "src-b2",
                documentId: "doc-tram-002",
                name: "CEC00248102.pdf",
                srcId: "src_d97d2254bae76779",
                page: 3,
            },
        ],
    },
    {
        id: "chr-21",
        companyId: "co-001",
        ownerUserId: "u-003",
        reference: "6.21",
        title: "Night Works Lighting Sign-off",
        topic: "Night works lighting sign-off",
        createdAt: "2024-07-12T16:40:00.000Z",
        status: "failed",
        sections: [],
        sources: [],
    },
];

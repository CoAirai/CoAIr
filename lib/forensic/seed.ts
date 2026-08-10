import type { ForensicReport } from "./types";

export const SEED_FORENSIC_REPORTS: ForensicReport[] = [
    {
        id: "for-14",
        companyId: "co-001",
        reference: "7.14",
        title: "Windows analysis: MUDFA critical delay",
        topic: "MUDFA critical delay across successive windows",
        method: "windows",
        baselineProgramme: "Tram baseline Rev 03",
        updatedProgramme: "P6 update 38",
        dataDate: "2008-06-01",
        startDate: "2006-02-01",
        endDate: "2008-06-01",
        createdAt: "2024-08-11T09:40:00.000Z",
        status: "ready",
        sections: [
            {
                id: "overview",
                heading: "14.1 Windows overview",
                body: "Windows analysis of MUDFA critical delay between 2006-02-01 and 2008-06-01. [src_afaf1a13caf7baeb] Each window compares the tram baseline with the contemporaneous update then in force.",
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
                id: "window-a",
                heading: "14.2 Window 1 — 2006",
                body: "Incomplete diversions constrained access and delayed regular progress of the follow-on works. [src_d97d2254bae76779] Delay in this window measured to the then-current sectional completion.",
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
                id: "window-b",
                heading: "14.3 Window 2 — close-out",
                body: "Mitigation reduced but did not remove critical impact. [src_2e77b2a61338aa1f] [src_afaf1a13caf7baeb] Residual delay remained on the driving path at the data date.",
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
                id: "for-src-a",
                documentId: "doc-tram-001",
                name: "CEC00246714.pdf",
                srcId: "src_afaf1a13caf7baeb",
                page: 5,
            },
            {
                id: "for-src-b",
                documentId: "doc-tram-002",
                name: "CEC00248102.pdf",
                srcId: "src_d97d2254bae76779",
                page: 3,
            },
            {
                id: "for-src-c",
                documentId: "doc-tram-003",
                name: "CEC00249011.pdf",
                srcId: "src_2e77b2a61338aa1f",
                page: 2,
            },
        ],
    },
    {
        id: "for-12",
        companyId: "co-001",
        reference: "7.12",
        title: "DCMA 14-point: live programme quality",
        topic: "Live programme quality on the tram works",
        method: "dcma",
        baselineProgramme: "Tram baseline Rev 03",
        updatedProgramme: "P6 update 42",
        dataDate: "2008-03-01",
        createdAt: "2024-08-08T14:15:00.000Z",
        status: "ready",
        sections: [
            {
                id: "overview",
                heading: "12.1 DCMA overview",
                body: "DCMA 14-point review of the live tram programme at 2008-03-01. [src_d97d2254bae76779] High-float and missing-logic counts sit above threshold on utility interface activities.",
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
                id: "finding",
                heading: "12.2 Quality finding",
                body: "The live file is not yet a reliable forensic instrument until missing logic is corrected. [src_afaf1a13caf7baeb]",
                citations: [
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
                id: "for-src-d",
                documentId: "doc-tram-002",
                name: "CEC00248102.pdf",
                srcId: "src_d97d2254bae76779",
                page: 3,
            },
            {
                id: "for-src-e",
                documentId: "doc-tram-001",
                name: "CEC00246714.pdf",
                srcId: "src_afaf1a13caf7baeb",
                page: 5,
            },
        ],
    },
    {
        id: "for-09",
        companyId: "co-001",
        reference: "7.09",
        title: "Critical path: Gogar depot possession",
        topic: "Gogar depot possession on the critical path",
        method: "critical_path",
        createdAt: "2024-07-30T11:20:00.000Z",
        status: "ready",
        sections: [
            {
                id: "overview",
                heading: "9.1 Critical path overview",
                body: "Critical-path comparison for late possession at Gogar depot. [src_d97d2254bae76779] The driving sequence moved onto possession and utility close-out.",
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
                id: "for-src-f",
                documentId: "doc-tram-002",
                name: "CEC00248102.pdf",
                srcId: "src_d97d2254bae76779",
                page: 3,
            },
        ],
    },
    {
        id: "for-07",
        companyId: "co-001",
        reference: "7.07",
        title: "Prospective TIA: night works lighting",
        topic: "Night works lighting remaining impact",
        method: "prospective",
        createdAt: "2024-07-18T08:05:00.000Z",
        status: "failed",
        sections: [],
        sources: [],
    },
];

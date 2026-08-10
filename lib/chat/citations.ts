import type { Citation } from "./types";

export type CitedDocument = {
    id: string;
    name: string;
};

export type DocumentPage = {
    page: number;
    heading?: string;
    text: string;
};

export type DocumentPreview = {
    documentId: string;
    name: string;
    pageCount: number;
    pages: DocumentPage[];
};

export const DOCUMENT_PREVIEWS: Record<string, DocumentPreview> = {
    "doc-001": {
        documentId: "doc-001",
        name: "Acme Site Safety Plan.pdf",
        pageCount: 3,
        pages: [
            {
                page: 1,
                heading: "1.1 Site induction",
                text: "Site induction requires edge protection on all open floors above 2m. Night works need temporary lighting signed off by the lift supervisor before any shift starts on site.",
            },
            {
                page: 2,
                heading: "1.4 Crane lifts",
                text: "A nominated lift supervisor must clear the exclusion zone before any slew. Banksmen remain in radio contact for the full lift. No personnel may enter the marked zone until the load is landed and the crane is made safe.",
            },
            {
                page: 3,
                heading: "1.7 Open risks",
                text: "The Contractor has assessed that as a result of the above issues the Work Sections have been impacted. Open risks: incomplete edge protection on Grid C, crane exclusion not marked at Gate 2, and night lighting gaps on the north elevation. Additional resources are being used to mitigate delay to the Programme.",
            },
        ],
    },
    "doc-002": {
        documentId: "doc-002",
        name: "Edinburgh Tram Inquiry extract.pdf",
        pageCount: 3,
        pages: [
            {
                page: 1,
                heading: "2.1 Governance",
                text: "The Inquiry examined project governance, utility diversions, and the sequence of design freeze decisions that affected programme certainty across the tram works.",
            },
            {
                page: 2,
                heading: "2.4 Gogar depot delay",
                text: "Delay at Gogar depot was linked to incomplete design information and late possession of the site from utility contractors. Regular progress of the Works was delayed despite mitigation.",
            },
            {
                page: 3,
                heading: "2.8 Recommendations",
                text: "Recommendations focused on earlier contractor involvement and a single source of truth for programme risk, including clearer document control for notices and correspondence.",
            },
        ],
    },
    "doc-003": {
        documentId: "doc-003",
        name: "Q2 Cost Tracker.xlsx",
        pageCount: 2,
        pages: [
            {
                page: 1,
                heading: "Q2 summary",
                text: "Outliers: structural steel (+18%) and weekend prelims (+11%). Remaining packages tracked within 4% of baseline at period close.",
            },
            {
                page: 2,
                heading: "Notes",
                text: "Steel variance driven by late drawing revisions. Prelims variance driven by two additional Saturday shifts authorised to recover programme.",
            },
        ],
    },
    "doc-004": {
        documentId: "doc-004",
        name: "Beta Labs Trial Notes.pdf",
        pageCount: 1,
        pages: [
            {
                page: 1,
                heading: "Trial notes",
                text: "Demo corpus ingested for chatbot evaluation. No production claims. Cite this file only as sample evidence until live storage is connected.",
            },
        ],
    },
    "doc-tram-001": {
        documentId: "doc-tram-001",
        name: "CEC00246714.pdf",
        pageCount: 5,
        pages: [
            {
                page: 1,
                heading: "Cover",
                text: "City of Edinburgh Council — Tram project correspondence file CEC00246714.",
            },
            {
                page: 5,
                heading: "Utility interface",
                text: "MUDFA diversions remain incomplete in the sections required for follow-on construction. Access is constrained and regular progress of the Works is delayed pending completion of the remaining utility clearances.",
            },
        ],
    },
    "doc-tram-002": {
        documentId: "doc-tram-002",
        name: "CEC00248102.pdf",
        pageCount: 3,
        pages: [
            {
                page: 3,
                heading: "Notice",
                text: "Notice that utility works were not complete as programmed. The Contractor records delay to possession and seeks instruction on mitigation sequencing.",
            },
        ],
    },
    "doc-tram-003": {
        documentId: "doc-tram-003",
        name: "CEC00249011.pdf",
        pageCount: 2,
        pages: [
            {
                page: 2,
                heading: "Reply",
                text: "Reply confirming attempted mitigation and residual interface risk between utility contractors and the main works contractor.",
            },
        ],
    },
};

export function buildMockCitations(documents: CitedDocument[]): Citation[] {
    return documents.slice(0, 3).map((doc, index) => {
        const preview = DOCUMENT_PREVIEWS[doc.id];
        const page = preview
            ? Math.min(preview.pageCount, index + 1)
            : index + 1;
        const excerpt =
            preview?.pages.find((entry) => entry.page === page)?.text ??
            `Mock extract from ${doc.name}, page ${page}.`;

        return {
            documentId: doc.id,
            name: doc.name,
            page,
            excerpt,
        };
    });
}

export function fileKindLabel(name: string): string {
    const lower = name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
        return "XLS";
    }
    if (lower.endsWith(".pdf")) return "PDF";
    return "FILE";
}

export function pageRef(name: string, page: number): string {
    const stem = name.replace(/\.[^.]+$/, "").replace(/\s+/g, "").slice(0, 12).toUpperCase();
    return `${stem}_${String(page).padStart(4, "0")}`;
}

export function getDocumentPreview(
    documentId: string,
    name: string
): DocumentPreview {
    return (
        DOCUMENT_PREVIEWS[documentId] ?? {
            documentId,
            name,
            pageCount: 1,
            pages: [
                {
                    page: 1,
                    heading: "Preview",
                    text: `Mock preview for ${name}. Connect document storage later to show the real file.`,
                },
            ],
        }
    );
}

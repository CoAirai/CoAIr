export type CompanyDocumentKind = "document" | "spreadsheet" | "csv" | "communication";

export type CompanyDocument = {
    id: string;
    companyId: string;
    name: string;
    kind: CompanyDocumentKind;
    addedByUserId: string;
    addedAt: string;
};

export type DocumentActorRole = "super_admin" | "company_admin" | "member";

export function canRemoveCompanyDocument(role: DocumentActorRole): boolean {
    return role === "company_admin";
}

export function addCompanyDocument(input: {
    documents: CompanyDocument[];
    companyId: string;
    name: string;
    kind: CompanyDocumentKind;
    addedByUserId: string;
    now: string;
    id: string;
}): { ok: true; documents: CompanyDocument[] } | { ok: false; error: string } {
    const name = input.name.trim();
    if (!name) {
        return { ok: false, error: "Document name required" };
    }

    const next: CompanyDocument = {
        id: input.id,
        companyId: input.companyId,
        name,
        kind: input.kind,
        addedByUserId: input.addedByUserId,
        addedAt: input.now,
    };

    return { ok: true, documents: [next, ...input.documents] };
}

export function removeCompanyDocument(input: {
    documents: CompanyDocument[];
    documentId: string;
    actorRole: DocumentActorRole;
}): { ok: true; documents: CompanyDocument[] } | { ok: false; error: string } {
    if (!canRemoveCompanyDocument(input.actorRole)) {
        return { ok: false, error: "Only company admin can remove documents" };
    }

    if (!input.documents.some((doc) => doc.id === input.documentId)) {
        return { ok: false, error: "Document not found" };
    }

    return {
        ok: true,
        documents: input.documents.filter((doc) => doc.id !== input.documentId),
    };
}

export const SEED_COMPANY_DOCUMENTS: CompanyDocument[] = [
    {
        id: "doc-001",
        companyId: "co-001",
        name: "Acme Site Safety Plan.pdf",
        kind: "document",
        addedByUserId: "u-001",
        addedAt: "2026-07-01T09:00:00.000Z",
    },
    {
        id: "doc-002",
        companyId: "co-001",
        name: "Edinburgh Tram Inquiry extract.pdf",
        kind: "document",
        addedByUserId: "u-001",
        addedAt: "2026-07-10T09:00:00.000Z",
    },
    {
        id: "doc-003",
        companyId: "co-001",
        name: "Q2 Cost Tracker.xlsx",
        kind: "spreadsheet",
        addedByUserId: "u-002",
        addedAt: "2026-07-15T09:00:00.000Z",
    },
    {
        id: "doc-004",
        companyId: "co-002",
        name: "Beta Labs Trial Notes.pdf",
        kind: "document",
        addedByUserId: "u-005",
        addedAt: "2026-07-20T09:00:00.000Z",
    },
];

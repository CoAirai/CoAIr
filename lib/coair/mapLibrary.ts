import type { CompanyDocument, CompanyDocumentKind } from "@/lib/admin/companyDocuments";

export type CoairLibraryDoc = {
    doc_id?: string;
    file_name?: string;
    file_type?: string;
    extension?: string;
    created_at?: string;
};

export function kindFromLibraryDoc(doc: CoairLibraryDoc): CompanyDocumentKind {
    const type = (doc.file_type || "").toLowerCase();
    const ext = (doc.extension || "").toLowerCase();
    if (type === "email" || ext === ".eml" || ext === ".msg") {
        return "communication";
    }
    if (type === "data" || ext === ".xlsx" || ext === ".xls") {
        return "spreadsheet";
    }
    if (ext === ".csv") {
        return "csv";
    }
    return "document";
}

export function mapLibraryDocuments(
    docs: CoairLibraryDoc[] | undefined,
    companyId: string
): CompanyDocument[] {
    if (!docs?.length) return [];
    return docs.map((doc) => ({
        id: doc.doc_id || doc.file_name || "doc",
        companyId,
        name: doc.file_name || doc.doc_id || "Document",
        kind: kindFromLibraryDoc(doc),
        addedByUserId: "live",
        addedAt: doc.created_at || new Date().toISOString(),
    }));
}

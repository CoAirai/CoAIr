import { describe, expect, it } from "vitest";
import {
    addCompanyDocument,
    canRemoveCompanyDocument,
    removeCompanyDocument,
} from "./companyDocuments";

const existing = [
    {
        id: "doc-001",
        companyId: "co-001",
        name: "Safety.pdf",
        kind: "document" as const,
        addedByUserId: "u-001",
        addedAt: "2026-07-01T00:00:00.000Z",
    },
];

describe("companyDocuments", () => {
    it("lets any member add a document", () => {
        const result = addCompanyDocument({
            documents: existing,
            companyId: "co-001",
            name: "Notes.csv",
            kind: "csv",
            addedByUserId: "u-002",
            now: "2026-08-05T10:00:00.000Z",
            id: "doc-002",
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.documents).toHaveLength(2);
            expect(result.documents[0]?.name).toBe("Notes.csv");
        }
    });

    it("rejects remove for members and allows company admin", () => {
        expect(canRemoveCompanyDocument("member")).toBe(false);
        expect(canRemoveCompanyDocument("company_admin")).toBe(true);

        const denied = removeCompanyDocument({
            documents: existing,
            documentId: "doc-001",
            actorRole: "member",
        });
        expect(denied.ok).toBe(false);

        const allowed = removeCompanyDocument({
            documents: existing,
            documentId: "doc-001",
            actorRole: "company_admin",
        });
        expect(allowed.ok).toBe(true);
        if (allowed.ok) {
            expect(allowed.documents).toHaveLength(0);
        }
    });
});

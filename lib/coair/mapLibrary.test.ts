import { describe, expect, it } from "vitest";
import { kindFromLibraryDoc, mapLibraryDocuments } from "./mapLibrary";

describe("kindFromLibraryDoc", () => {
    it("maps email and spreadsheet types", () => {
        expect(kindFromLibraryDoc({ file_type: "email" })).toBe("communication");
        expect(kindFromLibraryDoc({ file_type: "data" })).toBe("spreadsheet");
        expect(kindFromLibraryDoc({ extension: ".csv" })).toBe("csv");
        expect(kindFromLibraryDoc({ file_type: "document" })).toBe("document");
    });
});

describe("mapLibraryDocuments", () => {
    it("maps API library rows onto company documents", () => {
        expect(
            mapLibraryDocuments(
                [{ doc_id: "d1", file_name: "Safety.pdf", file_type: "document" }],
                "org-1"
            )
        ).toEqual([
            {
                id: "d1",
                companyId: "org-1",
                name: "Safety.pdf",
                kind: "document",
                addedByUserId: "live",
                addedAt: expect.any(String),
            },
        ]);
    });
});

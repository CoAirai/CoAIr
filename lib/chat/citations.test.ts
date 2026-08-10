import { describe, expect, it } from "vitest";
import { buildMockCitations, getDocumentPreview } from "./citations";

describe("buildMockCitations", () => {
    it("returns clickable refs for company documents", () => {
        const citations = buildMockCitations([
            { id: "doc-001", name: "Acme Site Safety Plan.pdf" },
            { id: "doc-002", name: "Edinburgh Tram Inquiry extract.pdf" },
        ]);

        expect(citations).toHaveLength(2);
        expect(citations[0]).toMatchObject({
            documentId: "doc-001",
            name: "Acme Site Safety Plan.pdf",
            page: 1,
        });
        expect(citations[0]?.excerpt.length).toBeGreaterThan(20);
    });
});

describe("getDocumentPreview", () => {
    it("opens seeded preview pages for a cited file", () => {
        const preview = getDocumentPreview(
            "doc-001",
            "Acme Site Safety Plan.pdf"
        );
        expect(preview.pageCount).toBe(3);
        expect(preview.pages[1]?.text.toLowerCase()).toContain("crane");
    });
});

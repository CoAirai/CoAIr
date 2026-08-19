import { describe, expect, it } from "vitest";
import { mapLiveCitations, pageFromAnchor } from "./mapCitations";

describe("pageFromAnchor", () => {
    it("reads a page number from the API anchor", () => {
        expect(pageFromAnchor("page_3")).toBe(3);
        expect(pageFromAnchor("")).toBe(1);
        expect(pageFromAnchor(undefined)).toBe(1);
    });
});

describe("mapLiveCitations", () => {
    it("maps API citations onto the chat citation shape", () => {
        expect(
            mapLiveCitations([
                {
                    doc_id: "d1",
                    doc_name: "Safety.pdf",
                    anchor: "page_2",
                    snippet: "edge protection",
                },
            ])
        ).toEqual([
            {
                documentId: "d1",
                name: "Safety.pdf",
                page: 2,
                excerpt: "edge protection",
            },
        ]);
    });
});

import { describe, expect, it } from "vitest";
import { citationForReference, parseAnswer } from "./answerText";

const SAMPLE = `Based on the provided document excerpts, the details are as follows:

### 1. Award Date
* The **System Design Services (SDS)** contract was awarded in **September 2005** (*CEC01821403.pdf, p.80*; *CEC01783327.pdf, p.48*).

---

### 2. Scope of Work and Role
The scope included:

* **Design Development:** Developing preliminary design (*CEC01858129.pdf, p.1*).
`;

describe("parseAnswer", () => {
    it("turns markdown headings into bold headings and citations into links", () => {
        const blocks = parseAnswer(SAMPLE);
        expect(blocks.map((block) => block.type)).toEqual([
            "paragraph",
            "heading",
            "paragraph",
            "heading",
            "paragraph",
            "paragraph",
        ]);
        expect(blocks[1]).toMatchObject({
            type: "heading",
            parts: [{ type: "text", text: "1. Award Date" }],
        });
        const award = blocks[2].parts;
        expect(award.some((part) => part.type === "bold" && part.text === "September 2005")).toBe(
            true
        );
        expect(award).toEqual(
            expect.arrayContaining([
                { type: "cite", name: "CEC01821403.pdf", page: 80 },
                { type: "cite", name: "CEC01783327.pdf", page: 48 },
            ])
        );
        expect(JSON.stringify(blocks)).not.toContain("###");
        expect(JSON.stringify(blocks)).not.toContain("**");
    });

    it("keeps a numbered heading bold when it is already plain text", () => {
        const blocks = parseAnswer("1. Award Date\n\nThe contract was awarded in September 2005 (CEC01821403.pdf, p.80).");
        expect(blocks[0]).toMatchObject({
            type: "heading",
            parts: [{ type: "text", text: "1. Award Date" }],
        });
        expect(blocks[1].parts).toEqual(
            expect.arrayContaining([{ type: "cite", name: "CEC01821403.pdf", page: 80 }])
        );
    });
});

describe("citationForReference", () => {
    it("reuses the stored document id when the file name matches", () => {
        expect(
            citationForReference("CEC01821403.pdf", 80, [
                {
                    documentId: "doc-1",
                    name: "CEC01821403.pdf",
                    page: 12,
                    excerpt: "award",
                },
            ])
        ).toEqual({
            documentId: "doc-1",
            name: "CEC01821403.pdf",
            page: 80,
            excerpt: "award",
        });
    });
});

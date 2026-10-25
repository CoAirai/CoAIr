import { describe, expect, it } from "vitest";
import {
    citationForReference,
    inlineParts,
    parseAnswer,
    tableCsv,
    type AnswerBlock,
    type AnswerPart,
} from "./answerText";

function partsOf(block: AnswerBlock): AnswerPart[] {
    return block.type === "table" || block.type === "code" ? [] : block.parts;
}

function cites(parts: AnswerPart[]) {
    return parts.filter((part) => part.type === "cite");
}

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
        const award = partsOf(blocks[2]);
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
        expect(partsOf(blocks[1])).toEqual(
            expect.arrayContaining([{ type: "cite", name: "CEC01821403.pdf", page: 80 }])
        );
    });
});

describe("parseAnswer tables", () => {
    it("keeps a markdown table as columns and leaves the prose around it", () => {
        const blocks = parseAnswer(
            [
                "The largest agreed variations are below.",
                "",
                "| Rank | Description | Agreed Value (£) | Source |",
                "| --- | --- | --- | --- |",
                "| 1 | NR Immunisation | £4,700,000.00 | cec00825621 |",
                "| 2 | Depot design changes | £2,000,000.00 | cec01431386 |",
                "",
                "The top item is about 36% of the savings.",
            ].join("\n")
        );
        expect(blocks.map((block) => block.type)).toEqual([
            "paragraph",
            "table",
            "paragraph",
        ]);
        expect(blocks[1]).toMatchObject({
            type: "table",
            headers: ["Rank", "Description", "Agreed Value (£)", "Source"],
            rows: [
                ["1", "NR Immunisation", "£4,700,000.00", "cec00825621"],
                ["2", "Depot design changes", "£2,000,000.00", "cec01431386"],
            ],
        });
        expect(tableCsv(["Rank", "Source"], [["1", 'say "a"']])).toBe(
            '"Rank","Source"\n"1","say ""a"""'
        );
    });
});

describe("inline references in other shapes", () => {
    it("links a bold file name followed by the page in brackets", () => {
        const parts = inlineParts(
            "Additionally, **CEC00472633.pdf** (p. 31) and **CEC00416111.pdf** (p. 67) mention it."
        );
        expect(cites(parts)).toEqual([
            { type: "cite", name: "CEC00472633.pdf", page: 31 },
            { type: "cite", name: "CEC00416111.pdf", page: 67 },
        ]);
        expect(parts.map((part) => ("text" in part ? part.text : "")).join("")).not.toContain("(p.");
    });

    it("links a file name in code formatting with no page", () => {
        expect(cites(inlineParts("* **`TIE00685906.pdf`**: In an email sent on 02 May"))).toEqual([
            { type: "cite", name: "TIE00685906.pdf", page: undefined },
        ]);
        expect(cites(inlineParts("Document `CEC02086351.pdf` references an audit"))).toEqual([
            { type: "cite", name: "CEC02086351.pdf", page: undefined },
        ]);
    });

    it("links the file of a page list and a spelled-out page", () => {
        const parts = inlineParts("According to **BFB00003290_PART2.pdf** (pages 88 and 107), the update");
        expect(cites(parts)).toEqual([
            { type: "cite", name: "BFB00003290_PART2.pdf", page: undefined },
        ]);
        expect(cites(inlineParts("see CEC00111659.pdf page 19"))).toEqual([
            { type: "cite", name: "CEC00111659.pdf", page: 19 },
        ]);
    });

    it("does not swallow the words before a file name", () => {
        expect(cites(inlineParts("In CEC00472633.pdf the Board"))).toEqual([
            { type: "cite", name: "CEC00472633.pdf", page: undefined },
        ]);
    });

    it("links source names with spaces and internal table names to the cited file", () => {
        const sources = ["Acme Site Safety Plan.pdf", "CEC00825621.xlsx"];
        expect(cites(inlineParts("as the Acme Site Safety Plan.pdf (p. 2) requires", sources))).toEqual([
            { type: "cite", name: "Acme Site Safety Plan.pdf", page: 2 },
        ]);
        expect(cites(inlineParts("`cec00825621_ve_agreed_with_bbs_608bd3`", sources))).toEqual([
            { type: "cite", name: "CEC00825621.xlsx", page: undefined },
        ]);
        expect(cites(inlineParts("`cec00355114_p7_813fa2_clean`", sources))).toEqual([]);
    });

    it("links file names in table cells and sheet references", () => {
        expect(cites(inlineParts("CEC00833711.pdf"))).toEqual([
            { type: "cite", name: "CEC00833711.pdf", page: undefined },
        ]);
        expect(cites(inlineParts("(TIE00355078.xls, sheet 'Latest AFC Rec', row 24)"))).toEqual([
            { type: "cite", name: "TIE00355078.xls", page: undefined },
        ]);
    });
});

describe("citationForReference", () => {
    it("opens the cited page when the answer gives none", () => {
        expect(
            citationForReference("CEC00111659.pdf", undefined, [
                { documentId: "d", name: "CEC00111659.pdf", page: 19, excerpt: "" },
            ]).page
        ).toBe(19);
        expect(citationForReference("X.pdf", undefined, []).page).toBe(1);
    });

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


describe("DGX compact headings", () => {
    it("accepts compact multi-hash headings while preserving inline hashes and hashtags", () => {
        expect(parseAnswer("###Summary")[0]).toEqual({type: "heading", parts: [{type:"text", text:"Summary"}]});
        expect(parseAnswer("#hashtag and C# remain text")[0].type).toBe("paragraph");
        expect(parseAnswer("#######invalid")[0].type).toBe("paragraph");
    });
});

it("does not interpret headings and formulas in code fences", () => {
    expect(parseAnswer("```text\n###Literal\n```" )).toEqual([{type:"code", text:"###Literal"}]);
});

it("neutralizes spreadsheet formulas in CSV while retaining numeric negatives", () => {
    expect(tableCsv(["Value"], [["=HYPERLINK(1)"], ["-25.5"]])).toBe('"Value"\n"\'=HYPERLINK(1)"\n"-25.5"');
});

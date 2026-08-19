import { describe, expect, it } from "vitest";
import { linesToPdf, tableToLines, tableToPdf } from "./exportPdf";

describe("tableToLines", () => {
    it("builds a titled table including empty-state headers", () => {
        expect(tableToLines("Usage", [])).toEqual([
            "Usage",
            "",
            "Note",
            "------------",
        ]);
        expect(
            tableToLines("Usage", [{ Company: "Acme", Tokens: "12" }])
        ).toEqual([
            "Usage",
            "",
            "Company | Tokens",
            "----------------",
            "Acme | 12",
        ]);
    });
});

describe("linesToPdf", () => {
    it("writes a PDF header, catalog, and the report title", () => {
        const pdf = new TextDecoder().decode(tableToPdf("Revenue", []));
        expect(pdf.startsWith("%PDF-1.4")).toBe(true);
        expect(pdf).toContain("%%EOF");
        expect(pdf).toContain("(Revenue)");
        expect(linesToPdf(["Hello"]).length).toBeGreaterThan(80);
    });
});

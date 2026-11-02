import { describe, expect, it } from "vitest";
import { sourceHighlight } from "./sourceHighlight";
function marked(text: string, quote: string, focus = "") {
    const span = sourceHighlight(text, quote, focus);
    return span ? text.slice(span.start, span.end) : null;
}
describe("source passage highlighting", () => {
    it("matches a short phrase rather than requiring a chunk", () => {
        expect(marked("The agreed payment was £45,000 on Friday.", "£45,000")).toBe("45,000");
        expect(marked("Access was provided on 20 January 2007.", "20 January 2007")).toBe("20 January 2007");
    });
    it("preserves original offsets through OCR line breaks and punctuation", () => {
        const page = "START. The finalisation of\n  the detailed designs for tram-\nstops was delayed. END";
        expect(marked(page, "the finalisation of the detailed designs for tramstops")).toBe("The finalisation of\n  the detailed designs for tram-\nstops");
    });
    it("matches Unicode ligatures and curly quotes without altering source text", () => {
        expect(marked("The ﬁnal design was ‘approved’ today.", "The final design was approved")).toBe("The ﬁnal design was ‘approved");
    });
    it("uses the clicked answer to select a short part of a large chunk", () => {
        const page = "Design review information was received. ".repeat(30) + "The approved payment was £45,000 on 28 January 2011. " + "Other information was received. ".repeat(30);
        const span = sourceHighlight(page, page, "Payment of £45,000 on 28 January 2011");
        expect(span).not.toBeNull();
        expect(page.slice(span!.start, span!.end)).toContain("45,000");
        expect(span!.end - span!.start).toBeLessThanOrEqual(260);
    });
    it("does not highlight another page or an unsupported paraphrase", () => {
        expect(marked("The project ended in March.", "Access was provided on 20 January 2007")).toBeNull();
        expect(marked("The project ended in March.", "The works were completed during spring")).toBeNull();
    });
    it("rejects ambiguous short matches and empty citations", () => {
        expect(marked("Paid in 2011; approved in 2011.", "2011")).toBeNull();
        expect(marked("The payment was received.", "the")).toBeNull();
        expect(marked("The payment was received.", "")).toBeNull();
    });
    it("does not use answer words without support in the source excerpt", () => {
        expect(marked("Approved £45,000. Access was denied.", "Access was denied", "Approved £45,000")).toBe("Access was denied");
    });
});

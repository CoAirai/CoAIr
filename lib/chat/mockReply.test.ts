import { describe, expect, it } from "vitest";
import { buildMockAnswer, buildMockReply } from "./mockReply";

describe("buildMockReply", () => {
    it("acknowledges the user question", () => {
        const reply = buildMockReply("What is in the Edinburgh Tram Inquiry?");
        expect(reply).toContain("Edinburgh Tram Inquiry");
        expect(reply.toLowerCase()).toContain("mock");
    });

    it("handles empty input with a fallback", () => {
        const reply = buildMockReply("   ");
        expect(reply.length).toBeGreaterThan(0);
        expect(reply.toLowerCase()).toContain("mock");
    });

    it("cites company document names when present", () => {
        const reply = buildMockReply("Summarize the safety plan", [
            "Acme Site Safety Plan.pdf",
        ]);
        expect(reply).toContain("Acme Site Safety Plan.pdf");
    });
});

describe("buildMockAnswer", () => {
    it("attaches citation chips for referenced documents", () => {
        const answer = buildMockAnswer("What caused the delay?", [
            { id: "doc-002", name: "Edinburgh Tram Inquiry extract.pdf" },
        ]);
        expect(answer.citations[0]?.documentId).toBe("doc-002");
        expect(answer.content).toContain("Edinburgh Tram Inquiry extract.pdf");
    });
});

import { describe, expect, it } from "vitest";
import { conversationMessages } from "./conversations";

describe("stored chat history", () => {
    it("restores source citations and timestamps without displaying internal system messages", () => {
        const messages = conversationMessages({conversation_id: "c1", title: "Saved", messages: [
            {role: "system", content: "Internal instruction", timestamp: "t0"},
            {role: "user", content: "Who approved it?", timestamp: "t1"},
            {role: "assistant", content: "Alice approved it.", timestamp: "t2", response: {
                citations: [{doc_id: "doc", doc_name: "scan.pdf", anchor: "page_2", snippet: "Alice approved it."}],
            }},
        ]}, "owner");
        expect(messages).toHaveLength(2);
        expect(messages[0]).toMatchObject({role: "user", content: "Who approved it?", createdAt: "t1"});
        expect(messages[1].citations?.[0]).toMatchObject({documentId: "doc", name: "scan.pdf", page: 2});
    });
});

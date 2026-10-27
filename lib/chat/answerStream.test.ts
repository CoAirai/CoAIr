import { describe, expect, it } from "vitest";
import { readAnswerStream, updateAnswerDraft } from "./answerStream";

function response(parts: string[], oneByte = false) {
    const bytes = new TextEncoder().encode(parts.join(""));
    return new Response(new ReadableStream({ start(controller) {
        if (oneByte) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        else controller.enqueue(bytes);
        controller.close();
    } }));
}
const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;

describe("public answer stream", () => {
    it("decodes fragmented Unicode and uses the final checked response", async () => {
        const events: string[] = [];
        const result = await readAnswerStream<{ assistant_text: string }>(response([
            frame({ type: "activity", label: "Checking sources" }),
            frame({ type: "answer_delta", text: "Draft £25 – Edinburgh" }),
            frame({ type: "complete", response: { assistant_text: "Corrected £20", citations: [] } }),
        ], true), event => events.push(event.type));
        expect(result.assistant_text).toBe("Corrected £20");
        expect(events).toEqual(["activity", "answer_delta", "complete"]);
    });
    it("never accepts a disconnected partial answer as complete", async () => {
        await expect(readAnswerStream(response([frame({ type: "answer_delta", text: "partial" })])))
            .rejects.toThrow("before completion");
    });
    it("preserves quota errors without retrying the request", async () => {
        await expect(readAnswerStream(response([frame({ type: "error", status: 402, message: "Credits exhausted" })])))
            .rejects.toMatchObject({ status: 402, message: "Credits exhausted" });
    });
    it("replaces rejected drafts and retries only the current evidence section", () => {
        let draft = { text: "section one", base: "" };
        draft = updateAnswerDraft(draft, { type: "answer_start", append: true });
        draft = updateAnswerDraft(draft, { type: "answer_delta", text: " invalid duplicate" });
        draft = updateAnswerDraft(draft, { type: "answer_retry" });
        expect(draft.text).toBe("section one");
        draft = updateAnswerDraft(draft, { type: "answer_delta", text: " section two" });
        expect(draft.text).toBe("section one section two");
        expect(updateAnswerDraft(draft, { type: "answer_reset" }).text).toBe("");
    });
});

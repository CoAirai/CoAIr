import { CoairApiError } from "@/lib/coair/client";

export type AnswerStreamEvent = {
    type: string;
    text?: string;
    append?: boolean;
    kind?: string;
    label?: string;
    detail?: string;
    status?: number;
    message?: string;
    response?: unknown;
};

export type AnswerDraft = { text: string; base: string };
export function updateAnswerDraft(draft: AnswerDraft, event: AnswerStreamEvent): AnswerDraft {
    if (event.type === "answer_start") {
        const base = event.append ? draft.text : "";
        return { text: base, base };
    }
    if (event.type === "answer_retry") return { ...draft, text: draft.base };
    if (event.type === "answer_reset" || event.type === "error") return { text: "", base: "" };
    if (event.type === "answer_delta") return { ...draft, text: draft.text + (event.text ?? "") };
    return draft;
}

export async function readAnswerStream<T>(response: Response, onEvent?: (event: AnswerStreamEvent) => void): Promise<T> {
    if (!response.body) throw new Error("The answer stream is unavailable.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { value, done } = await reader.read();
            buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, "\n");
            let boundary: number;
            while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const data = frame.split("\n").filter(line => line.startsWith("data:"))
                    .map(line => line.slice(5).trimStart()).join("\n");
                if (!data) continue;
                const event = JSON.parse(data) as AnswerStreamEvent;
                onEvent?.(event);
                if (event.type === "error") throw new CoairApiError(
                    event.message || "Unable to complete the answer.", event.status || 500);
                if (event.type === "complete") {
                    const result = event.response as T & { assistant_text?: unknown };
                    if (!result || typeof result.assistant_text !== "string")
                        throw new Error("The completed answer is invalid.");
                    return result;
                }
            }
            if (done) throw new Error("The answer stream ended before completion. Please reopen the conversation before retrying.");
        }
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}

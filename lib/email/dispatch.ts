import type { EmailPayload, EmailSendResult } from "./types";

export async function dispatchEmail(
    payload: EmailPayload
): Promise<EmailSendResult> {
    try {
        const response = await fetch("/api/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = (await response.json()) as EmailSendResult;
        return data;
    } catch {
        return {
            ok: false,
            mode: "dry-run",
            error: "Email endpoint unavailable",
        };
    }
}

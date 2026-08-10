import { Resend } from "resend";
import { buildEmail } from "./templates";
import type { EmailPayload, EmailSendResult } from "./types";

export async function sendCoairEmail(
    payload: EmailPayload
): Promise<EmailSendResult> {
    const to = payload.to.trim();
    if (!to.includes("@")) {
        return { ok: false, mode: "dry-run", error: "Valid email required" };
    }

    const message = buildEmail({ ...payload, to });
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from =
        process.env.RESEND_FROM_EMAIL?.trim() || "COAir <noreply@coair.ai>";

    if (!apiKey) {
        return { ok: true, mode: "dry-run" };
    }

    try {
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
            from,
            to,
            subject: message.subject,
            html: message.html,
            text: message.text,
        });
        if (result.error) {
            return {
                ok: false,
                mode: "live",
                error: result.error.message,
            };
        }
        return { ok: true, mode: "live", id: result.data?.id };
    } catch (error) {
        return {
            ok: false,
            mode: "live",
            error: error instanceof Error ? error.message : "Email send failed",
        };
    }
}

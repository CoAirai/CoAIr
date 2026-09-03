import { NextResponse } from "next/server";
import { sendCoairEmail } from "@/lib/email/send";
import type { EmailKind, EmailPayload } from "@/lib/email/types";

const KINDS = new Set<EmailKind>([
    "team_invite",
    "owner_invite",
    "access_request_received",
    "access_approved",
    "access_denied",
    "password_reset",
    "password_reset_alert",
    "login_alert",
    "invoice_issued",
    "invoice_paid",
    "invoice_refunded",
    "purchase_receipt",
]);

type RelayPayload = EmailPayload & {
    company_name?: string;
    temporary_password?: string;
    reset_token?: string;
    is_resend?: boolean;
    invoice_id?: string;
    amount_label?: string;
};

function normalizePayload(body: RelayPayload | null): EmailPayload | null {
    if (!body || !KINDS.has(body.kind) || typeof body.to !== "string") {
        return null;
    }
    return {
        kind: body.kind,
        to: body.to,
        name: body.name,
        companyName: body.companyName ?? body.company_name,
        role: body.role,
        temporaryPassword: body.temporaryPassword ?? body.temporary_password,
        resetToken: body.resetToken ?? body.reset_token,
        isResend: body.isResend ?? body.is_resend,
        invoiceId: body.invoiceId ?? body.invoice_id,
        amountLabel: body.amountLabel ?? body.amount_label,
        description: body.description,
    };
}

export async function POST(request: Request) {
    const relaySecret = process.env.COAIR_EMAIL_RELAY_SECRET?.trim();
    if (relaySecret) {
        const provided = request.headers.get("x-coair-email-secret")?.trim();
        if (provided !== relaySecret) {
            return NextResponse.json(
                { ok: false, mode: "live", error: "relay_unauthorized" },
                { status: 401 }
            );
        }
    }

    const body = normalizePayload(
        (await request.json().catch(() => null)) as RelayPayload | null
    );
    if (!body) {
        return NextResponse.json(
            { ok: false, mode: "dry-run", error: "Invalid email payload" },
            { status: 400 }
        );
    }

    const result = await sendCoairEmail(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

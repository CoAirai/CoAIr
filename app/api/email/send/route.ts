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
]);

export async function POST(request: Request) {
    const body = (await request.json().catch(() => null)) as EmailPayload | null;
    if (!body || !KINDS.has(body.kind) || typeof body.to !== "string") {
        return NextResponse.json(
            { ok: false, mode: "dry-run", error: "Invalid email payload" },
            { status: 400 }
        );
    }

    const result = await sendCoairEmail(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

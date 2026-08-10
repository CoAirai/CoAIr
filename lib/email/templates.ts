import type { BuiltEmail, EmailPayload } from "./types";

function appUrl() {
    return (
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
        "http://localhost:3002"
    );
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function wrapHtml(title: string, body: string) {
    return `<!doctype html>
<html>
  <body style="font-family:Inter,Arial,sans-serif;background:#f4f6f8;padding:24px;color:#111">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
      <tr><td>
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#6b7280">COAir</p>
        <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>
        ${body}
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildEmail(payload: EmailPayload): BuiltEmail {
    const name = payload.name?.trim() || payload.to.split("@")[0];
    const company = payload.companyName?.trim() || "your company";
    const signIn = `${appUrl()}/auth/sign-in`;
    const reset = `${appUrl()}/auth/reset-password`;

    switch (payload.kind) {
        case "team_invite": {
            const subject = payload.isResend
                ? `Reminder: join ${company} on COAir`
                : `You're invited to ${company} on COAir`;
            const text = `Hi ${name},\n\nYou've been invited to ${company} on COAir${
                payload.role ? ` as ${payload.role}` : ""
            }.\n\nSign in: ${signIn}\n`;
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapHtml(
                    subject,
                    `<p>Hi ${escapeHtml(name)},</p><p>You've been invited to <strong>${escapeHtml(company)}</strong> on COAir${
                        payload.role ? ` as <strong>${escapeHtml(payload.role)}</strong>` : ""
                    }.</p><p><a href="${signIn}">Open COAir</a></p>`
                ),
            };
        }
        case "owner_invite": {
            const subject = `Set up ${company} on COAir`;
            const text = `Hi ${name},\n\nYour COAir company workspace for ${company} is ready. Sign in to finish setup:\n${signIn}\n`;
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapHtml(
                    subject,
                    `<p>Hi ${escapeHtml(name)},</p><p>Your COAir workspace for <strong>${escapeHtml(company)}</strong> is ready.</p><p><a href="${signIn}">Sign in and finish setup</a></p>`
                ),
            };
        }
        case "access_request_received": {
            const subject = "We received your COAir access request";
            const text = `Hi ${name},\n\nWe received your request for ${company}. Super Admin will review it shortly.\n`;
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapHtml(
                    subject,
                    `<p>Hi ${escapeHtml(name)},</p><p>We received your request for <strong>${escapeHtml(company)}</strong>. Super Admin will review it shortly.</p>`
                ),
            };
        }
        case "access_approved": {
            const subject = `${company} is approved — choose your COAir package`;
            const text = `Hi ${name},\n\nYour access request for ${company} was approved. Sign in and choose a package:\n${signIn}\n`;
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapHtml(
                    subject,
                    `<p>Hi ${escapeHtml(name)},</p><p>Your access request for <strong>${escapeHtml(company)}</strong> was approved.</p><p><a href="${signIn}">Sign in and choose a package</a></p>`
                ),
            };
        }
        case "access_denied": {
            const subject = `Update on your COAir request for ${company}`;
            const text = `Hi ${name},\n\nYour access request for ${company} was not approved. Reply to this thread if you need another review.\n`;
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapHtml(
                    subject,
                    `<p>Hi ${escapeHtml(name)},</p><p>Your access request for <strong>${escapeHtml(company)}</strong> was not approved.</p>`
                ),
            };
        }
        case "password_reset": {
            const subject = "Reset your COAir password";
            const text = `Hi ${name},\n\nUse this link to reset your password:\n${reset}\n\nIf you did not ask for this, ignore the email.\n`;
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapHtml(
                    subject,
                    `<p>Hi ${escapeHtml(name)},</p><p><a href="${reset}">Reset your password</a></p><p>If you did not ask for this, you can ignore the email.</p>`
                ),
            };
        }
    }
}

import {
    emailButton,
    emailCredentialBox,
    emailNotice,
    escapeHtml,
    wrapEmailHtml,
} from "./layout";
import { loginOrigin, signInUrl, userOrigin } from "@/lib/auth/hosts";
import type { BuiltEmail, EmailPayload } from "./types";

export function buildEmail(payload: EmailPayload): BuiltEmail {
    const name = payload.name?.trim() || payload.to.split("@")[0];
    const company = payload.companyName?.trim() || "your company";
    const signIn = signInUrl();
    const billingUrl = `${userOrigin()}/company/billing`;
    const resetToken = payload.resetToken?.trim();
    const reset = resetToken
        ? `${loginOrigin()}/auth/reset-password?token=${encodeURIComponent(resetToken)}`
        : `${loginOrigin()}/auth/reset-password`;
    const tempPassword = payload.temporaryPassword?.trim();
    const invoiceId = payload.invoiceId?.trim() || "invoice";
    const amountLabel = payload.amountLabel?.trim() || "—";
    const detail = payload.description?.trim() || "Your COAir billing update";

    switch (payload.kind) {
        case "team_invite": {
            const subject = payload.isResend
                ? `Reminder: join ${company} on COAir`
                : `You're invited to ${company} on COAir`;
            const roleLine = payload.role
                ? ` as ${payload.role}`
                : "";
            const text = `Hi ${name},\n\nYou've been invited to ${company} on COAir${roleLine}.\n\nSign in: ${signIn}\n${
                tempPassword
                    ? `\nEmail: ${payload.to}\nTemporary password: ${tempPassword}\n\nChange your password after your first sign-in.\n`
                    : ""
            }`;
            const body = [
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Hi ${escapeHtml(name)},</p>`,
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">You've been invited to join <strong style="color:#0E121B">${escapeHtml(company)}</strong> on COAir${
                    payload.role
                        ? ` as <strong style="color:#0E121B">${escapeHtml(payload.role)}</strong>`
                        : ""
                }.</p>`,
                emailNotice(
                    "COAir keeps drawings, correspondence, and answers in one workspace your whole team can trust."
                ),
                tempPassword
                    ? emailCredentialBox(payload.to, tempPassword)
                    : "",
                emailButton(signIn, "Open COAir"),
                `<p style="margin:0;font-size:13px;line-height:20px;color:#868C98">If the button doesn't work, copy this link:<br /><a href="${signIn}" style="color:#335CFF;text-decoration:none;word-break:break-all">${signIn}</a></p>`,
            ].join("");
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapEmailHtml({
                    title: payload.isResend
                        ? "Your invite is waiting"
                        : "You're invited",
                    preheader: `Join ${company} on COAir`,
                    body,
                }),
            };
        }
        case "owner_invite": {
            const subject = `Set up ${company} on COAir`;
            const text = `Hi ${name},\n\nYour COAir workspace for ${company} is ready.\n\nSign in: ${signIn}\n${
                tempPassword
                    ? `\nEmail: ${payload.to}\nTemporary password: ${tempPassword}\n`
                    : ""
            }`;
            const body = [
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Hi ${escapeHtml(name)},</p>`,
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Your COAir workspace for <strong style="color:#0E121B">${escapeHtml(company)}</strong> is ready. Sign in to finish setup, invite your team, and start working from one place.</p>`,
                tempPassword
                    ? emailCredentialBox(payload.to, tempPassword)
                    : "",
                emailButton(signIn, "Sign in and finish setup"),
                `<p style="margin:0;font-size:13px;line-height:20px;color:#868C98">If the button doesn't work, copy this link:<br /><a href="${signIn}" style="color:#335CFF;text-decoration:none;word-break:break-all">${signIn}</a></p>`,
            ].join("");
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapEmailHtml({
                    title: "Your workspace is ready",
                    preheader: `Set up ${company} on COAir`,
                    body,
                }),
            };
        }
        case "access_request_received": {
            const subject = "We received your COAir access request";
            const text = `Hi ${name},\n\nWe received your request for ${company}. Super Admin will review it shortly.\n`;
            const body = [
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Hi ${escapeHtml(name)},</p>`,
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">We received your access request for <strong style="color:#0E121B">${escapeHtml(company)}</strong>.</p>`,
                emailNotice(
                    "A Super Admin will review your request shortly. We'll email you as soon as there's an update."
                ),
            ].join("");
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapEmailHtml({
                    title: "Request received",
                    preheader: `Your request for ${company} is under review`,
                    body,
                }),
            };
        }
        case "access_approved": {
            const subject = `${company} is approved — choose your COAir package`;
            const text = `Hi ${name},\n\nYour access request for ${company} was approved.\n\nSign in: ${signIn}\n`;
            const body = [
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Hi ${escapeHtml(name)},</p>`,
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Great news — your access request for <strong style="color:#0E121B">${escapeHtml(company)}</strong> was approved.</p>`,
                emailNotice(
                    "Sign in to choose your package and activate your company workspace."
                ),
                emailButton(signIn, "Sign in and choose a package"),
            ].join("");
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapEmailHtml({
                    title: "You're approved",
                    preheader: `${company} is approved on COAir`,
                    body,
                }),
            };
        }
        case "access_denied": {
            const subject = `Update on your COAir request for ${company}`;
            const text = `Hi ${name},\n\nYour access request for ${company} was not approved.\n`;
            const body = [
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Hi ${escapeHtml(name)},</p>`,
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Your access request for <strong style="color:#0E121B">${escapeHtml(company)}</strong> was not approved at this time.</p>`,
                `<p style="margin:0;font-size:13px;line-height:20px;color:#868C98">If you believe this was a mistake, reply to this email or contact your platform administrator.</p>`,
            ].join("");
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapEmailHtml({
                    title: "Request update",
                    preheader: `Update on your COAir request for ${company}`,
                    body,
                }),
            };
        }
        case "password_reset": {
            const subject = "Reset your COAir password";
            const text = `Hi ${name},\n\nUse this link to reset your password:\n${reset}\n\nIf you did not ask for this, ignore the email.\n`;
            const body = [
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Hi ${escapeHtml(name)},</p>`,
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">We received a request to reset the password for your COAir account.</p>`,
                emailButton(reset, "Reset password"),
                `<p style="margin:0;font-size:13px;line-height:20px;color:#868C98">This link expires soon. If you did not ask for a reset, you can safely ignore this email.<br /><br />If the button doesn't work, copy this link:<br /><a href="${reset}" style="color:#335CFF;text-decoration:none;word-break:break-all">${reset}</a></p>`,
            ].join("");
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapEmailHtml({
                    title: "Reset your password",
                    preheader: "Use this link to choose a new COAir password",
                    body,
                }),
            };
        }
        case "invoice_issued":
        case "invoice_paid":
        case "invoice_refunded":
        case "purchase_receipt": {
            const titles = {
                invoice_issued: "New invoice",
                invoice_paid: "Payment received",
                invoice_refunded: "Invoice refunded",
                purchase_receipt: "Purchase receipt",
            } as const;
            const title = titles[payload.kind];
            const subject =
                payload.kind === "invoice_issued"
                    ? `Invoice ${invoiceId} for ${company}`
                    : payload.kind === "invoice_paid"
                      ? `Payment confirmed — ${invoiceId}`
                      : payload.kind === "invoice_refunded"
                        ? `Refund issued — ${invoiceId}`
                        : `Receipt for ${company}`;
            const text = `Hi ${name},\n\n${title} for ${company}.\nInvoice: ${invoiceId}\nAmount: ${amountLabel}\nDetails: ${detail}\n\nView billing: ${billingUrl}\n`;
            const body = [
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">Hi ${escapeHtml(name)},</p>`,
                `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#525866">${escapeHtml(title)} for <strong style="color:#0E121B">${escapeHtml(company)}</strong>.</p>`,
                emailNotice(
                    `Invoice ${invoiceId} · ${amountLabel} · ${detail}`
                ),
                emailButton(billingUrl, "View billing"),
            ].join("");
            return {
                kind: payload.kind,
                to: payload.to,
                subject,
                text,
                html: wrapEmailHtml({
                    title,
                    preheader: `${title} · ${invoiceId}`,
                    body,
                }),
            };
        }
    }
}

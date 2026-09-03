"""Send transactional COAir emails through Resend (no Supabase mail)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from html import escape
from typing import Any, Dict, Optional

from .logger import logger


RESEND_API = "https://api.resend.com/emails"
EMAIL_KINDS = {
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
}


def app_origin() -> str:
    return user_app_origin()


def user_app_origin() -> str:
    return (
        os.getenv("COAIR_USER_URL", "").strip().rstrip("/")
        or os.getenv("COAIR_APP_URL", "").strip().rstrip("/")
        or os.getenv("NEXT_PUBLIC_APP_URL", "").strip().rstrip("/")
        or "http://localhost:3002"
    )


def login_app_origin() -> str:
    return (
        os.getenv("COAIR_LOGIN_URL", "").strip().rstrip("/")
        or user_app_origin()
    )


def admin_app_origin() -> str:
    return (
        os.getenv("COAIR_ADMIN_URL", "").strip().rstrip("/")
        or user_app_origin()
    )


def _from_email() -> str:
    return os.getenv("RESEND_FROM_EMAIL", "COAir <noreply@coair.ai>").strip()


def _api_key() -> str:
    return os.getenv("RESEND_API_KEY", "").strip()


def _logo_url() -> str:
    return f"{user_app_origin()}/images/coair-logo.png"


def _email_button(href: str, label: str) -> str:
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">'
        "<tr><td align=\"center\" style=\"border-radius:12px;background:#335CFF\">"
        f"<a href=\"{href}\" target=\"_blank\" "
        "style=\"display:inline-block;padding:13px 28px;font-family:Inter,Arial,sans-serif;"
        "font-size:14px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none\">"
        f"{escape(label)}</a></td></tr></table>"
    )


def _email_credential_box(username: str, password: str) -> str:
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="margin:20px 0;background:#F4F6F8;border:1px solid #E1E4EA;border-radius:12px">'
        "<tr><td style=\"padding:18px 20px;font-family:Inter,Arial,sans-serif\">"
        "<p style=\"margin:0 0 10px;font-size:13px;line-height:20px;color:#525866\">"
        "Sign in with your email and this temporary password:</p>"
        "<p style=\"margin:0 0 8px;font-size:13px;line-height:20px;color:#525866\">Email</p>"
        f"<p style=\"margin:0 0 14px;font-size:15px;line-height:22px;font-weight:600;color:#0E121B\">"
        f"{escape(username)}</p>"
        "<p style=\"margin:0 0 8px;font-size:13px;line-height:20px;color:#525866\">"
        "Temporary password</p>"
        "<p style=\"margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;"
        "font-size:16px;line-height:24px;font-weight:600;letter-spacing:.04em;color:#0E121B\">"
        f"{escape(password)}</p></td></tr></table>"
        "<p style=\"margin:0 0 8px;font-size:13px;line-height:20px;color:#525866\">"
        "Change your password after your first sign-in.</p>"
    )


def _email_notice(text: str) -> str:
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="margin:20px 0;background:#F8FAFF;border:1px solid #D6E4FF;border-radius:12px">'
        "<tr><td style=\"padding:16px 18px;font-family:Inter,Arial,sans-serif;"
        f"font-size:14px;line-height:22px;color:#0E121B\">{text}</td></tr></table>"
    )


def _wrap_html(title: str, body: str, *, preheader: str = "") -> str:
    logo = _logo_url()
    year = __import__("datetime").datetime.utcnow().year
    hidden = ""
    if preheader:
        hidden = (
            f"<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent\">"
            f"{escape(preheader)}</div>"
        )
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{escape(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F4F6F8;font-family:Inter,Arial,sans-serif;color:#0E121B">
    {hidden}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E1E4EA;border-radius:20px;overflow:hidden">
            <tr>
              <td style="padding:32px 32px 24px;border-bottom:1px solid #F0F2F5">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left">
                      <img src="{logo}" width="48" height="48" alt="COAir" style="display:block;width:48px;height:48px;border:0;border-radius:12px" />
                    </td>
                    <td align="right" style="vertical-align:middle">
                      <p style="margin:0;font-size:12px;line-height:18px;letter-spacing:.14em;text-transform:uppercase;color:#868C98">Project intelligence</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px">
                <h1 style="margin:0 0 16px;font-size:28px;line-height:36px;font-weight:700;color:#0E121B">{escape(title)}</h1>
                {body}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;border-top:1px solid #F0F2F5;background:#FAFBFC">
                <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#868C98">© {year} COAir. All rights reserved.</p>
                <p style="margin:0;font-size:12px;line-height:18px;color:#868C98">
                  <a href="https://coair.ai" style="color:#335CFF;text-decoration:none">coair.ai</a>
                  · Secure workspace for project teams
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def build_email(
    kind: str,
    to: str,
    *,
    name: str = "",
    company_name: str = "",
    role: str = "",
    temporary_password: str = "",
    reset_token: str = "",
    is_resend: bool = False,
    invoice_id: str = "",
    amount_label: str = "",
    description: str = "",
) -> Dict[str, str]:
    recipient = (to or "").strip()
    display = (name or "").strip() or recipient.split("@")[0]
    company = (company_name or "").strip() or "your company"
    sign_in = f"{login_app_origin()}/auth/sign-in"
    billing_url = f"{user_app_origin()}/company/billing"
    reset_base = f"{login_app_origin()}/auth/reset-password"
    reset_link = (
        f"{reset_base}?token={reset_token}" if reset_token else reset_base
    )
    inv = (invoice_id or "").strip() or "invoice"
    amount = (amount_label or "").strip() or "—"
    detail = (description or "").strip() or "Your COAir billing update"

    if kind == "team_invite":
        subject = (
            f"Reminder: join {company} on COAir"
            if is_resend
            else f"You're invited to {company} on COAir"
        )
        role_line = f" as {role}" if role else ""
        password_block = ""
        if temporary_password:
            password_block = _email_credential_box(recipient, temporary_password)
        text = (
            f"Hi {display},\n\nYou've been invited to {company} on COAir{role_line}.\n\n"
            f"Sign in: {sign_in}\n"
        )
        if temporary_password:
            text += f"\nEmail: {recipient}\nTemporary password: {temporary_password}\n"
        role_html = ""
        if role:
            role_html = (
                f" as <strong style=\"color:#0E121B\">{escape(role)}</strong>"
            )
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"You've been invited to join <strong style=\"color:#0E121B\">{escape(company)}</strong> on COAir"
            f"{role_html}.</p>"
            f"{_email_notice('COAir keeps drawings, correspondence, and answers in one workspace your whole team can trust.')}"
            f"{password_block}"
            f"{_email_button(sign_in, 'Open COAir')}"
            f"<p style=\"margin:0;font-size:13px;line-height:20px;color:#868C98\">If the button doesn't work, copy this link:<br />"
            f"<a href=\"{sign_in}\" style=\"color:#335CFF;text-decoration:none;word-break:break-all\">{sign_in}</a></p>"
        )
        html = _wrap_html(
            "Your invite is waiting" if is_resend else "You're invited",
            body,
            preheader=f"Join {company} on COAir",
        )
        return {"subject": subject, "text": text, "html": html}

    if kind == "owner_invite":
        subject = f"Set up {company} on COAir"
        password_block = ""
        if temporary_password:
            password_block = _email_credential_box(recipient, temporary_password)
        text = (
            f"Hi {display},\n\nYour COAir workspace for {company} is ready.\n"
            f"Sign in: {sign_in}\n"
        )
        if temporary_password:
            text += f"\nEmail: {recipient}\nTemporary password: {temporary_password}\n"
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"Your COAir workspace for <strong style=\"color:#0E121B\">{escape(company)}</strong> is ready. "
            f"Sign in to finish setup, invite your team, and start working from one place.</p>"
            f"{password_block}"
            f"{_email_button(sign_in, 'Sign in and finish setup')}"
            f"<p style=\"margin:0;font-size:13px;line-height:20px;color:#868C98\">If the button doesn't work, copy this link:<br />"
            f"<a href=\"{sign_in}\" style=\"color:#335CFF;text-decoration:none;word-break:break-all\">{sign_in}</a></p>"
        )
        html = _wrap_html(
            "Your workspace is ready",
            body,
            preheader=f"Set up {company} on COAir",
        )
        return {"subject": subject, "text": text, "html": html}

    if kind == "access_request_received":
        subject = "We received your COAir access request"
        text = f"Hi {display},\n\nWe received your request for {company}. Super Admin will review it shortly.\n"
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"We received your access request for <strong style=\"color:#0E121B\">{escape(company)}</strong>.</p>"
            f"{_email_notice('A Super Admin will review your request shortly. We will email you as soon as there is an update.')}"
        )
        html = _wrap_html(
            "Request received",
            body,
            preheader=f"Your request for {company} is under review",
        )
        return {"subject": subject, "text": text, "html": html}

    if kind == "access_approved":
        subject = f"{company} is approved — choose your COAir package"
        text = (
            f"Hi {display},\n\nYour access request for {company} was approved.\n"
            f"Sign in: {sign_in}\n"
        )
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"Great news — your access request for <strong style=\"color:#0E121B\">{escape(company)}</strong> was approved.</p>"
            f"{_email_notice('Sign in to choose your package and activate your company workspace.')}"
            f"{_email_button(sign_in, 'Sign in and choose a package')}"
        )
        html = _wrap_html(
            "You're approved",
            body,
            preheader=f"{company} is approved on COAir",
        )
        return {"subject": subject, "text": text, "html": html}

    if kind == "access_denied":
        subject = f"Update on your COAir request for {company}"
        text = f"Hi {display},\n\nYour access request for {company} was not approved.\n"
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"Your access request for <strong style=\"color:#0E121B\">{escape(company)}</strong> was not approved at this time.</p>"
            f"<p style=\"margin:0;font-size:13px;line-height:20px;color:#868C98\">"
            f"If you believe this was a mistake, reply to this email or contact your platform administrator.</p>"
        )
        html = _wrap_html(
            "Request update",
            body,
            preheader=f"Update on your COAir request for {company}",
        )
        return {"subject": subject, "text": text, "html": html}

    if kind == "password_reset":
        subject = "Reset your COAir password"
        text = (
            f"Hi {display},\n\nUse this link to reset your password:\n{reset_link}\n\n"
            f"If you did not ask for this, ignore the email.\n"
        )
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"We received a request to reset the password for your COAir account.</p>"
            f"{_email_button(reset_link, 'Reset password')}"
            f"<p style=\"margin:0;font-size:13px;line-height:20px;color:#868C98\">"
            f"This link expires soon. If you did not ask for a reset, you can safely ignore this email."
            f"<br /><br />If the button doesn't work, copy this link:<br />"
            f"<a href=\"{reset_link}\" style=\"color:#335CFF;text-decoration:none;word-break:break-all\">{reset_link}</a></p>"
        )
        html = _wrap_html(
            "Reset your password",
            body,
            preheader="Use this link to choose a new COAir password",
        )
        return {"subject": subject, "text": text, "html": html}

    if kind == "password_reset_alert":
        subject = f"Password reset requested — {company}"
        text = (
            f"Hi {display},\n\n{detail}\n\n"
            f"If this was unexpected, ask the teammate to confirm or reset access from company admin.\n"
        )
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"A password reset was requested for someone in <strong style=\"color:#0E121B\">{escape(company)}</strong>.</p>"
            f"{_email_notice(detail)}"
            f"<p style=\"margin:0;font-size:13px;line-height:20px;color:#868C98\">"
            f"The teammate received the reset link by email. No action is required unless this looks suspicious.</p>"
        )
        html = _wrap_html(
            "Password reset alert",
            body,
            preheader=f"Password reset requested for {company}",
        )
        return {"subject": subject, "text": text, "html": html}

    if kind == "login_alert":
        subject = f"New COAir sign-in — {company}"
        text = (
            f"Hi {display},\n\n{detail}\n\n"
            f"If this wasn't you, reset your password right away:\n{reset_base}\n"
        )
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"Security notice for <strong style=\"color:#0E121B\">{escape(company)}</strong>.</p>"
            f"{_email_notice(detail)}"
            f"{_email_button(reset_base, 'Reset password if this was not you')}"
            f"<p style=\"margin:0;font-size:13px;line-height:20px;color:#868C98\">"
            f"You receive these alerts when Email notifications are enabled in Settings.</p>"
        )
        html = _wrap_html(
            "New sign-in",
            body,
            preheader=detail,
        )
        return {"subject": subject, "text": text, "html": html}

    if kind in {"invoice_issued", "invoice_paid", "invoice_refunded", "purchase_receipt"}:
        titles = {
            "invoice_issued": "New invoice",
            "invoice_paid": "Payment received",
            "invoice_refunded": "Invoice refunded",
            "purchase_receipt": "Purchase receipt",
        }
        subject_map = {
            "invoice_issued": f"Invoice {inv} for {company}",
            "invoice_paid": f"Payment confirmed — {inv}",
            "invoice_refunded": f"Refund issued — {inv}",
            "purchase_receipt": f"Receipt for {company}",
        }
        subject = subject_map[kind]
        title = titles[kind]
        text = (
            f"Hi {display},\n\n{title} for {company}.\n"
            f"Invoice: {inv}\nAmount: {amount}\nDetails: {detail}\n\n"
            f"View billing: {billing_url}\n"
        )
        body = (
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">Hi {escape(display)},</p>"
            f"<p style=\"margin:0 0 16px;font-size:15px;line-height:24px;color:#525866\">"
            f"{escape(title)} for <strong style=\"color:#0E121B\">{escape(company)}</strong>.</p>"
            f"{_email_notice(f'Invoice {inv} · {amount} · {detail}')}"
            f"{_email_button(billing_url, 'View billing')}"
            f"<p style=\"margin:0;font-size:13px;line-height:20px;color:#868C98\">"
            f"If the button doesn't work, copy this link:<br />"
            f"<a href=\"{billing_url}\" style=\"color:#335CFF;text-decoration:none;word-break:break-all\">{billing_url}</a></p>"
        )
        html = _wrap_html(title, body, preheader=f"{title} · {inv}")
        return {"subject": subject, "text": text, "html": html}

    raise ValueError(f"unsupported_email_kind:{kind}")


def _relay_url() -> str:
    explicit = os.getenv("COAIR_EMAIL_RELAY_URL", "").strip().rstrip("/")
    # Local Docker relay is for dev only — never block production sends on it.
    if explicit and "host.docker.internal" in explicit:
        return ""
    if explicit:
        return explicit
    origin = app_origin()
    if origin and not origin.startswith("http://localhost"):
        return f"{origin}/api/email/send"
    return ""


def _relay_secret() -> str:
    return os.getenv("COAIR_EMAIL_RELAY_SECRET", "").strip()


def _send_via_relay(
    kind: str,
    recipient: str,
    *,
    name: str = "",
    company_name: str = "",
    role: str = "",
    temporary_password: str = "",
    reset_token: str = "",
    is_resend: bool = False,
    invoice_id: str = "",
    amount_label: str = "",
    description: str = "",
) -> Dict[str, Any]:
    relay = _relay_url()
    if not relay:
        return {"ok": False, "mode": "live", "error": "email_relay_not_configured"}

    payload = {
        "kind": kind,
        "to": recipient,
        "name": name,
        "companyName": company_name,
        "role": role,
        "temporaryPassword": temporary_password,
        "resetToken": reset_token,
        "isResend": is_resend,
        "invoiceId": invoice_id,
        "amountLabel": amount_label,
        "description": description,
    }
    headers = {"Content-Type": "application/json"}
    secret = _relay_secret()
    if secret:
        headers["X-COAir-Email-Secret"] = secret

    req = urllib.request.Request(
        relay,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
        if data.get("ok"):
            logger.info(
                "email_relay_sent kind=%s to=%s id=%s",
                kind,
                recipient,
                data.get("id"),
            )
            return {
                "ok": True,
                "mode": str(data.get("mode") or "live"),
                "id": data.get("id"),
            }
        error = str(data.get("error") or "relay_failed")
        logger.warning("email_relay_failed kind=%s to=%s err=%s", kind, recipient, error)
        return {"ok": False, "mode": "live", "error": error}
    except Exception as exc:
        logger.warning("email_relay_failed kind=%s to=%s err=%s", kind, recipient, exc)
        return {"ok": False, "mode": "live", "error": str(exc)}


def _send_via_resend(
    kind: str,
    recipient: str,
    message: Dict[str, str],
) -> Dict[str, Any]:
    api_key = _api_key()
    if not api_key:
        return {"ok": False, "mode": "dry-run", "error": "resend_not_configured"}

    payload = {
        "from": _from_email(),
        "to": [recipient],
        "subject": message["subject"],
        "html": message["html"],
        "text": message["text"],
    }
    req = urllib.request.Request(
        RESEND_API,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Cloudflare / Resend reject bare Python-urllib clients (error 1010).
            "User-Agent": "COAir-API/1.0 (+https://coair.ai)",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
        message_id = str(data.get("id") or "")
        logger.info("email_sent kind=%s to=%s id=%s", kind, recipient, message_id)
        return {"ok": True, "mode": "live", "id": message_id}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        logger.warning("email_send_failed kind=%s to=%s err=%s", kind, recipient, detail)
        return {"ok": False, "mode": "live", "error": detail or str(exc)}
    except Exception as exc:
        logger.warning("email_send_failed kind=%s to=%s err=%s", kind, recipient, exc)
        return {"ok": False, "mode": "live", "error": str(exc)}


def send_coair_email(
    kind: str,
    to: str,
    *,
    name: str = "",
    company_name: str = "",
    role: str = "",
    temporary_password: str = "",
    reset_token: str = "",
    is_resend: bool = False,
    invoice_id: str = "",
    amount_label: str = "",
    description: str = "",
) -> Dict[str, Any]:
    if kind not in EMAIL_KINDS:
        raise ValueError(f"unsupported_email_kind:{kind}")
    recipient = (to or "").strip()
    if "@" not in recipient:
        return {"ok": False, "mode": "dry-run", "error": "invalid_email"}

    message = build_email(
        kind,
        recipient,
        name=name,
        company_name=company_name,
        role=role,
        temporary_password=temporary_password,
        reset_token=reset_token,
        is_resend=is_resend,
        invoice_id=invoice_id,
        amount_label=amount_label,
        description=description,
    )

    # Prefer Resend when configured so production login/reset mail is not blocked
    # by an unreachable Next.js relay.
    api_key = _api_key()
    if api_key:
        direct = _send_via_resend(kind, recipient, message)
        if direct.get("ok"):
            return direct
        logger.info(
            "email_direct_failed_try_relay kind=%s to=%s err=%s",
            kind,
            recipient,
            direct.get("error"),
        )

    relay = _relay_url()
    if relay:
        relay_result = _send_via_relay(
            kind,
            recipient,
            name=name,
            company_name=company_name,
            role=role,
            temporary_password=temporary_password,
            reset_token=reset_token,
            is_resend=is_resend,
            invoice_id=invoice_id,
            amount_label=amount_label,
            description=description,
        )
        if relay_result.get("ok"):
            return relay_result
        if api_key:
            return {
                "ok": False,
                "mode": "live",
                "error": str(
                    relay_result.get("error")
                    or "email_send_failed"
                ),
            }

    if not api_key:
        logger.info("email_dry_run kind=%s to=%s", kind, recipient)
        return {"ok": True, "mode": "dry-run"}

    return {"ok": False, "mode": "live", "error": "email_send_failed"}


def recipient_address(username: str) -> str:
    from .supabase_auth import auth_email

    clean = (username or "").strip()
    return auth_email(clean) if "@" not in clean else clean.lower()

import { userOrigin } from "@/lib/auth/hosts";

export function emailLogoUrl() {
    return `${userOrigin()}/images/coair-logo.png`;
}

export function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export function emailButton(href: string, label: string) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">
  <tr>
    <td align="center" style="border-radius:12px;background:#335CFF">
      <a href="${href}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

export function emailCredentialBox(username: string, password: string) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#F4F6F8;border:1px solid #E1E4EA;border-radius:12px">
  <tr>
    <td style="padding:18px 20px;font-family:Inter,Arial,sans-serif">
      <p style="margin:0 0 10px;font-size:13px;line-height:20px;color:#525866">Sign in with your email and this temporary password:</p>
      <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#525866">Email</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:22px;font-weight:600;color:#0E121B">${escapeHtml(username)}</p>
      <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#525866">Temporary password</p>
      <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:16px;line-height:24px;font-weight:600;letter-spacing:.04em;color:#0E121B">${escapeHtml(password)}</p>
    </td>
  </tr>
</table>
<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#525866">Change your password after your first sign-in.</p>`;
}

export function emailNotice(text: string) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#F8FAFF;border:1px solid #D6E4FF;border-radius:12px">
  <tr>
    <td style="padding:16px 18px;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:22px;color:#0E121B">${text}</td>
  </tr>
</table>`;
}

type WrapEmailOptions = {
    title: string;
    body: string;
    preheader?: string;
};

export function wrapEmailHtml({ title, body, preheader = "" }: WrapEmailOptions) {
    const logo = emailLogoUrl();
    const hiddenPreheader = preheader
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>`
        : "";

    return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F4F6F8;font-family:Inter,Arial,sans-serif;color:#0E121B">
    ${hiddenPreheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E1E4EA;border-radius:20px;overflow:hidden">
            <tr>
              <td style="padding:32px 32px 24px;border-bottom:1px solid #F0F2F5">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left">
                      <img src="${logo}" width="48" height="48" alt="COAir" style="display:block;width:48px;height:48px;border:0;border-radius:12px" />
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
                <h1 style="margin:0 0 16px;font-size:28px;line-height:36px;font-weight:700;color:#0E121B">${escapeHtml(title)}</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;border-top:1px solid #F0F2F5;background:#FAFBFC">
                <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#868C98">© ${new Date().getFullYear()} COAir. All rights reserved.</p>
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
</html>`;
}

import type { Invoice } from "@/lib/admin/billingTypes";
import { userOrigin } from "@/lib/auth/hosts";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

export function formatInvoiceDate(value: string) {
    const raw = value.length <= 10 ? `${value}T00:00:00` : value;
    return dateFormatter.format(new Date(raw));
}

export function invoiceLogoUrl(): string {
    if (typeof window !== "undefined") {
        return `${window.location.origin}/images/coair-logo.png`;
    }
    return `${userOrigin()}/images/coair-logo.png`;
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Branded printable HTML invoice (logo + company details). */
export function buildInvoiceHtml(
    invoice: Invoice,
    companyName?: string
): string {
    const logo = invoiceLogoUrl();
    const company = companyName || invoice.companyId || "Customer";
    const issued = formatInvoiceDate(invoice.issuedAt);
    const due = formatInvoiceDate(invoice.dueAt);
    const amount = currencyFormatter.format(invoice.amountUsd);
    const status = invoice.status.replaceAll("_", " ");
    const description = invoice.description?.trim() || "—";

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(invoice.id)}</title>
  <style>
    @page { margin: 24mm; }
    body {
      margin: 0;
      font-family: "Segoe UI", Inter, Arial, sans-serif;
      color: #0e121b;
      background: #fff;
    }
    .sheet { max-width: 720px; margin: 0 auto; padding: 32px 28px; }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid #e1e4ea;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img {
      width: 56px; height: 56px; border-radius: 14px; object-fit: contain;
      border: 1px solid #e1e4ea;
    }
    .brand h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .brand p { margin: 4px 0 0; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #868c98; }
    .meta { text-align: right; font-size: 13px; color: #525866; }
    .meta strong { display: block; color: #0e121b; font-size: 16px; margin-bottom: 4px; }
    h2 { margin: 0 0 8px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; margin: 20px 0 28px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #868c98; }
    .value { margin-top: 4px; font-size: 14px; color: #0e121b; }
    .amount {
      margin-top: 8px; padding: 16px 18px; border-radius: 14px;
      background: #f8faff; border: 1px solid #d6e4ff;
      font-size: 28px; font-weight: 700;
    }
    .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #f0f2f5; font-size: 12px; color: #868c98; }
    @media print {
      .no-print { display: none !important; }
      .sheet { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        <img src="${escapeHtml(logo)}" alt="COAir" />
        <div>
          <h1>COAir</h1>
          <p>Invoice</p>
        </div>
      </div>
      <div class="meta">
        <strong>${escapeHtml(invoice.id)}</strong>
        Status: ${escapeHtml(status)}
      </div>
    </div>

    <h2>Bill to</h2>
    <p class="value" style="margin:0 0 20px;font-size:16px">${escapeHtml(company)}</p>

    <div class="grid">
      <div>
        <div class="label">Issued</div>
        <div class="value">${escapeHtml(issued)}</div>
      </div>
      <div>
        <div class="label">Due</div>
        <div class="value">${escapeHtml(due)}</div>
      </div>
      <div style="grid-column: 1 / -1">
        <div class="label">Description</div>
        <div class="value">${escapeHtml(description)}</div>
      </div>
    </div>

    <div class="label">Amount due</div>
    <div class="amount">${escapeHtml(amount)}</div>

    <div class="footer">
      Thank you for your business. Questions? Contact support via your COAir workspace.
      <br />© ${new Date().getFullYear()} COAir · coair.ai
    </div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;
}

/** HTML print fallback when Takumi/pdfcn render fails or is blocked. */
function downloadInvoiceHtmlFallback(
    invoice: Invoice,
    companyName?: string
) {
    const html = buildInvoiceHtml(invoice, companyName);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(
        url,
        "_blank",
        "noopener,noreferrer,width=900,height=1000"
    );
    if (!popup) {
        window.location.assign(url);
        return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Downloads a real PDF via pdfcn/Takumi. Falls back to branded HTML print
 * if WASM render fails (offline fonts, blocked CDN, etc.).
 */
export async function downloadInvoicePdf(
    invoice: Invoice,
    companyName?: string
): Promise<void> {
    try {
        const { renderAndDownloadInvoicePdf } = await import(
            "@/lib/admin/invoicePdf"
        );
        await renderAndDownloadInvoicePdf(invoice, companyName);
    } catch (error) {
        console.warn("Invoice PDF render failed; using HTML print fallback.", error);
        downloadInvoiceHtmlFallback(invoice, companyName);
    }
}

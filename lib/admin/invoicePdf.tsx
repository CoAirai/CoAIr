import type { Invoice } from "@/lib/admin/billingTypes";
import type { InvoiceMinimalData } from "@/components/pdf/blocks/invoice-minimal/invoice-minimal.types";
import { InvoiceMinimalDocument } from "@/components/pdf/blocks/invoice-minimal/invoice-minimal";
import { professionalTheme } from "@/components/professional";
import type { PdfcnTheme } from "@/components/pdf-themes";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function formatDate(value: string) {
  const raw = value.length <= 10 ? `${value}T00:00:00` : value;
  return dateFormatter.format(new Date(raw));
}

/** COAir-branded professional theme (blue accent to match product UI). */
export const coairInvoiceTheme: PdfcnTheme = {
  ...professionalTheme,
  name: "coair",
  colors: {
    ...professionalTheme.colors,
    accent: "#3b82f6",
    primary: "#1d4ed8",
    info: "#2563eb",
  },
  typography: {
    ...professionalTheme.typography,
    body: {
      ...professionalTheme.typography.body,
      fontFamily: "Inter",
    },
    heading: {
      ...professionalTheme.typography.heading,
      fontFamily: "Inter",
    },
  },
};

export function invoiceToMinimalData(
  invoice: Invoice,
  companyName?: string
): InvoiceMinimalData {
  const company = companyName?.trim() || invoice.companyId || "Customer";
  const issued = formatDate(invoice.issuedAt);
  const due = formatDate(invoice.dueAt);
  const amount = Number(invoice.amountUsd) || 0;
  const description =
    invoice.description?.trim() || "COAir platform services";
  const status = invoice.status.replaceAll("_", " ");

  return {
    invoiceNumber: invoice.id,
    invoiceDate: issued,
    dueDate: due,
    companyName: "COAir",
    subtitle: "AI workspace & usage billing",
    companyAddress: "coair.ai",
    companyEmail: "billing@coair.ai",
    billTo: {
      name: company,
      address: `Account ${invoice.companyId || "—"}`,
      email: "",
      phone: "",
    },
    items: [
      {
        description,
        quantity: 1,
        unitPrice: amount,
      },
    ],
    summary: {
      subtotal: amount,
      tax: 0,
      total: amount,
    },
    paymentTerms: {
      dueDate: due,
      method: "Card / workspace billing",
      gst: `Status: ${status}`,
    },
    notes:
      "Thank you for your business. Questions? Contact support via your COAir workspace.",
  };
}

function triggerPdfDownload(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Renders a real PDF via pdfcn / Takumi and downloads it in the browser.
 */
export async function renderAndDownloadInvoicePdf(
  invoice: Invoice,
  companyName?: string
): Promise<void> {
  // Webpack/Turbopack: default `takumi-pdf` resolves to a Vite `?url` loader.
  // Use no-init + wasm-url so the binary is emitted as a normal asset.
  const [{ default: init, render }, { default: wasmUrl }, { googleFonts }] =
    await Promise.all([
      import("takumi-pdf/no-init"),
      import("takumi-pdf/wasm-url"),
      import("@takumi-rs/helpers"),
    ]);

  await init({ module_or_path: wasmUrl });

  const data = invoiceToMinimalData(invoice, companyName);
  const fonts = await googleFonts(["Inter"]);

  const pdf = await render(
    <InvoiceMinimalDocument theme={coairInvoiceTheme} data={data} />,
    {
      size: "a4",
      fonts,
      metadata: {
        title: `Invoice ${invoice.id}`,
        authors: ["COAir"],
        description: "COAir invoice",
        creator: "COAir",
      },
    }
  );

  const safeId = invoice.id.replace(/[^\w.-]+/g, "_");
  triggerPdfDownload(pdf, `COAir-Invoice-${safeId}.pdf`);
}

import type { Invoice } from "@/lib/admin/billingTypes";
import { downloadPdf, linesToPdf } from "@/lib/admin/exportPdf";

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

export function invoiceDocumentLines(
    invoice: Invoice,
    companyName?: string
): string[] {
    return [
        "COAir Invoice",
        "",
        `Invoice ID: ${invoice.id}`,
        `Company: ${companyName || invoice.companyId || "—"}`,
        `Status: ${invoice.status.replaceAll("_", " ")}`,
        `Amount: ${currencyFormatter.format(invoice.amountUsd)}`,
        `Issued: ${formatInvoiceDate(invoice.issuedAt)}`,
        `Due: ${formatInvoiceDate(invoice.dueAt)}`,
        `Description: ${invoice.description?.trim() || "—"}`,
        "",
        "Thank you for your business.",
    ];
}

export function downloadInvoicePdf(
    invoice: Invoice,
    companyName?: string
) {
    const lines = invoiceDocumentLines(invoice, companyName);
    const bytes = linesToPdf(lines);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    const blob = new Blob([copy], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/** Keep downloadPdf import available for callers that prefer table export. */
export { downloadPdf };

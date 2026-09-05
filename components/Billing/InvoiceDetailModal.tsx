"use client";

import Image from "@/components/Image";
import Modal from "@/components/Modal";
import StatusBadge from "@/components/Admin/StatusBadge";
import type { Invoice } from "@/lib/admin/billingTypes";
import {
    downloadInvoicePdf,
    formatInvoiceDate,
    invoiceLogoUrl,
} from "@/lib/admin/invoiceDocument";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});

type Props = {
    invoice: Invoice | null;
    companyName?: string;
    onClose: () => void;
};

const InvoiceDetailModal = ({ invoice, companyName, onClose }: Props) => {
    if (!invoice) return null;

    return (
        <Modal open={Boolean(invoice)} onClose={onClose} classWrapper="max-w-lg">
            <div className="space-y-4">
                <div className="flex items-start gap-3">
                    <Image
                        src={invoiceLogoUrl()}
                        alt="COAir"
                        width={48}
                        height={48}
                        className="size-12 rounded-xl border border-stroke-soft-200 object-contain"
                    />
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-soft-400">
                            COAir invoice
                        </p>
                        <h2 className="mt-1 text-h5 text-strong-950">
                            {invoice.id}
                        </h2>
                    </div>
                </div>

                <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <dt className="text-label-xs text-sub-600">Company</dt>
                        <dd className="mt-1 text-label-sm text-strong-950">
                            {companyName || invoice.companyId || "—"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-label-xs text-sub-600">Status</dt>
                        <dd className="mt-1">
                            <StatusBadge
                                status={invoice.status.replaceAll("_", " ")}
                            />
                        </dd>
                    </div>
                    <div>
                        <dt className="text-label-xs text-sub-600">Amount</dt>
                        <dd className="mt-1 text-label-sm tabular-nums text-strong-950">
                            {currencyFormatter.format(invoice.amountUsd)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-label-xs text-sub-600">Issued</dt>
                        <dd className="mt-1 text-label-sm text-strong-950">
                            {formatInvoiceDate(invoice.issuedAt)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-label-xs text-sub-600">Due</dt>
                        <dd className="mt-1 text-label-sm text-strong-950">
                            {formatInvoiceDate(invoice.dueAt)}
                        </dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-label-xs text-sub-600">Description</dt>
                        <dd className="mt-1 text-label-sm text-strong-950">
                            {invoice.description?.trim() || "—"}
                        </dd>
                    </div>
                </dl>

                <div className="flex flex-wrap gap-3 pt-1">
                    <button
                        type="button"
                        onClick={() =>
                            downloadInvoicePdf(invoice, companyName)
                        }
                        className="h-10 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                    >
                        Download PDF
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 rounded-xl border border-stroke-soft-200 px-4 text-label-sm text-strong-950 hover:bg-weak-50"
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default InvoiceDetailModal;

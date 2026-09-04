"use client";

import { FormEvent, useEffect, useState } from "react";

import Field from "@/components/Field";
import Modal from "@/components/Modal";

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    summary: string;
    amountLabel: string;
    pricingNote?: string | null;
    couponCode?: string;
    onCouponCodeChange?: (value: string) => void;
    onConfirm: () =>
        | { ok: boolean; error?: string }
        | Promise<{ ok: boolean; error?: string }>;
};

const CheckoutModal = ({
    open,
    onClose,
    title,
    summary,
    amountLabel,
    pricingNote,
    couponCode = "",
    onCouponCodeChange,
    onConfirm,
}: Props) => {
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            setError(null);
            setSuccess(false);
            setSubmitting(false);
        }
    }, [open]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (success || submitting) return;

        setSubmitting(true);
        setError(null);
        try {
            const result = await onConfirm();
            if (!result.ok) {
                setError(result.error ?? "Unable to complete purchase");
                return;
            }

            // Stripe Checkout redirects away; if we return here, payment was
            // fulfilled immediately (dummy/no-Stripe fallback).
            setSuccess(true);
            setTimeout(() => onClose(), 1200);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} classWrapper="max-w-md w-full">
            <h2 className="text-label-xl text-strong-950">{title}</h2>
            <p className="mt-2 text-label-sm text-sub-600">{summary}</p>
            <p className="mt-3 text-label-lg text-strong-950">{amountLabel}</p>
            {pricingNote ? (
                <p className="mt-1 text-label-xs text-sub-600">{pricingNote}</p>
            ) : null}

            {success ? (
                <p className="mt-6 rounded-xl bg-green-500/10 px-4 py-3 text-label-sm text-green-600">
                    Payment successful. Your account has been updated.
                </p>
            ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    {onCouponCodeChange ? (
                        <Field
                            label="Coupon code (optional)"
                            placeholder="SAVE10"
                            value={couponCode}
                            onChange={(event) =>
                                onCouponCodeChange(event.target.value)
                            }
                        />
                    ) : null}
                    <p className="rounded-xl bg-weak-50 px-4 py-3 text-label-sm text-sub-600">
                        You will continue to Stripe Checkout to pay securely.
                        Card details are entered on Stripe — not here.
                    </p>
                    {error ? (
                        <p className="text-label-xs text-red-500">{error}</p>
                    ) : null}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-10 flex-1 rounded-xl border border-stroke-soft-200 text-label-sm text-sub-600"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="h-10 flex-1 rounded-xl bg-blue-500 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-50"
                        >
                            {submitting ? "Working…" : "Continue to Stripe"}
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default CheckoutModal;

"use client";

import { FormEvent, useEffect, useState } from "react";

import Modal from "@/components/Modal";

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    summary: string;
    amountLabel: string;
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

            {success ? (
                <p className="mt-6 rounded-xl bg-green-500/10 px-4 py-3 text-label-sm text-green-600">
                    Payment successful. Your account has been updated.
                </p>
            ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <p className="rounded-xl bg-weak-50 px-4 py-3 text-label-sm text-sub-600">
                        You will continue to Stripe Checkout to pay securely.
                        Card details are entered on Stripe — not here.
                    </p>
                    {error ? (
                        <p className="text-label-xs text-red-500">{error}</p>
                    ) : null}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="h-10 flex-1 rounded-full bg-strong-950 text-label-sm text-white-0 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submitting
                                ? "Redirecting to Stripe…"
                                : "Pay with Stripe"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="h-10 rounded-full border border-stroke-soft-200 px-4 text-label-sm text-strong-950 hover:bg-weak-50"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default CheckoutModal;

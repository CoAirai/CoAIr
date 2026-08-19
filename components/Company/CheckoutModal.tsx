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
    const [nameOnCard, setNameOnCard] = useState("");
    const [last4, setLast4] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            setNameOnCard("");
            setLast4("");
            setError(null);
            setSuccess(false);
            setSubmitting(false);
        }
    }, [open]);

    const canConfirm =
        nameOnCard.trim().length > 0 &&
        last4.trim().length > 0 &&
        !success &&
        !submitting;

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!canConfirm) return;

        setSubmitting(true);
        try {
            const result = await onConfirm();
            if (!result.ok) {
                setError(result.error ?? "Unable to complete purchase");
                return;
            }

            setError(null);
            setSuccess(true);
            setTimeout(() => onClose(), 1200);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            classWrapper="max-w-md w-full"
        >
            <h2 className="text-label-xl text-strong-950">{title}</h2>
            <p className="mt-2 text-label-sm text-sub-600">{summary}</p>
            <p className="mt-3 text-label-lg text-strong-950">{amountLabel}</p>

            {success ? (
                <p className="mt-6 rounded-xl bg-green-500/10 px-4 py-3 text-label-sm text-green-600">
                    Payment successful. Your account has been updated.
                </p>
            ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Name on card
                        </span>
                        <input
                            value={nameOnCard}
                            onChange={(event) => {
                                setNameOnCard(event.target.value);
                                setError(null);
                            }}
                            placeholder="Ada Lovelace"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Card last 4 digits
                        </span>
                        <input
                            value={last4}
                            onChange={(event) => {
                                setLast4(event.target.value);
                                setError(null);
                            }}
                            placeholder="4242"
                            maxLength={4}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    {error && (
                        <p className="text-label-xs text-red-500">{error}</p>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={!canConfirm}
                            className="h-10 flex-1 rounded-full bg-strong-950 text-label-sm text-white-0 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submitting ? "Charging…" : "Confirm payment"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
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

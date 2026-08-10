"use client";

import Modal from "@/components/Modal";

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "danger" | "default";
    onConfirm: () => void;
};

const ConfirmModal = ({
    open,
    onClose,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone = "default",
    onConfirm,
}: Props) => {
    const confirmClass =
        tone === "danger"
            ? "bg-red-500 text-white-0 hover:bg-red-600"
            : "bg-strong-950 text-white-0 hover:bg-strong-950/90";

    return (
        <Modal open={open} onClose={onClose} classWrapper="max-w-md w-full">
            <h2 className="text-label-xl text-strong-950">{title}</h2>
            <p className="mt-2 text-label-sm text-sub-600">{description}</p>
            <div className="mt-6 flex justify-end gap-3">
                <button
                    type="button"
                    className="h-10 rounded-full border border-stroke-soft-200 px-4 text-label-sm text-sub-600 hover:text-strong-950"
                    onClick={onClose}
                >
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    className={`h-10 rounded-full px-4 text-label-sm ${confirmClass}`}
                    onClick={() => {
                        onConfirm();
                        onClose();
                    }}
                >
                    {confirmLabel}
                </button>
            </div>
        </Modal>
    );
};

export default ConfirmModal;

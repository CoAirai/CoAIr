"use client";

import Link from "next/link";

type Props = {
    open: boolean;
    moduleTitle: string;
    reason: "addon" | "trial_exhausted" | "user_denied";
    isCompanyAdmin: boolean;
    onClose: () => void;
};

const UpgradePackageModal = ({
    open,
    moduleTitle,
    reason,
    isCompanyAdmin,
    onClose,
}: Props) => {
    if (!open) return null;

    const title =
        reason === "user_denied" ? "No access" : "Update package";
    const body =
        reason === "user_denied"
            ? `Your account does not include ${moduleTitle}. Ask your company admin or Super Admin to enable it for you.`
            : reason === "trial_exhausted"
              ? `The ${moduleTitle} trial is used up. Update your package or enable the add-on to continue.`
              : `${moduleTitle} is an add-on on your current package. Update the package to open it.`;

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay/60 p-4">
            <div className="w-full max-w-md rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 shadow-xl">
                <h2 className="text-label-lg text-strong-950">{title}</h2>
                <p className="mt-2 text-label-sm text-sub-600">{body}</p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 rounded-xl px-4 text-label-sm text-sub-600 hover:bg-weak-50"
                    >
                        Close
                    </button>
                    {reason !== "user_denied" && isCompanyAdmin ? (
                        <Link
                            href="/company/billing"
                            className="inline-flex h-10 items-center rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                        >
                            Go to billing
                        </Link>
                    ) : reason !== "user_denied" ? (
                        <p className="self-center text-label-sm text-sub-600">
                            Ask your company admin to update the package.
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default UpgradePackageModal;

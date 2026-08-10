"use client";

import Link from "next/link";

type Props = {
    open: boolean;
    moduleTitle: string;
    reason: "addon" | "trial_exhausted";
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

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay/60 p-4">
            <div className="w-full max-w-md rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 shadow-xl">
                <h2 className="text-label-lg text-strong-950">Update package</h2>
                <p className="mt-2 text-label-sm text-sub-600">
                    {reason === "trial_exhausted"
                        ? `The ${moduleTitle} trial is used up. Update your package or enable the add-on to continue.`
                        : `${moduleTitle} is an add-on on your current package. Update the package to open it.`}
                </p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 rounded-xl px-4 text-label-sm text-sub-600 hover:bg-weak-50"
                    >
                        Close
                    </button>
                    {isCompanyAdmin ? (
                        <Link
                            href="/company/billing"
                            className="inline-flex h-10 items-center rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                        >
                            Go to billing
                        </Link>
                    ) : (
                        <p className="self-center text-label-sm text-sub-600">
                            Ask your company admin to update the package.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UpgradePackageModal;

"use client";

import Link from "next/link";
import { useState } from "react";
import type { ModuleId } from "@/lib/admin/types";
import { apiErrorMessage } from "@/lib/coair/commerce";
import {
    createOrgModuleAccessRequest,
    createOrgModuleUnlockRequest,
    type ModuleAccessModule,
} from "@/lib/coair/ops";

type Props = {
    open: boolean;
    moduleTitle: string;
    moduleId?: ModuleId | null;
    reason: "addon" | "trial_exhausted" | "user_denied";
    isCompanyAdmin: boolean;
    accessToken?: string | null;
    pendingRequest?: boolean;
    onClose: () => void;
    onRequested?: () => void;
};

const isAccessModule = (id?: ModuleId | null): id is ModuleAccessModule =>
    id === "chronology" || id === "forensic";

const UpgradePackageModal = ({
    open,
    moduleTitle,
    moduleId,
    reason,
    isCompanyAdmin,
    accessToken,
    pendingRequest = false,
    onClose,
    onRequested,
}: Props) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    if (!open) return null;

    const accessModule = isAccessModule(moduleId) ? moduleId : null;
    const needsAccessRequest =
        Boolean(accessModule) &&
        (reason === "user_denied" || reason === "addon");
    const requestSuperAdmin = needsAccessRequest && isCompanyAdmin;
    const requestCompanyAdmin = needsAccessRequest && !isCompanyAdmin;

    const title = requestSuperAdmin
        ? "Request Super Admin"
        : requestCompanyAdmin
          ? "Request company admin"
          : reason === "user_denied"
            ? "No access"
            : "Update package";

    const body = done
        ? requestSuperAdmin
            ? `Your request to unlock ${moduleTitle} for the company was sent to Super Admin.`
            : `Your request for ${moduleTitle} was sent to your company admin.`
        : pendingRequest
          ? requestSuperAdmin
              ? `A unlock request for ${moduleTitle} is already pending Super Admin review.`
              : `Your request for ${moduleTitle} is already pending company admin review.`
          : requestSuperAdmin
            ? `${moduleTitle} is not unlocked for your company yet. Request Super Admin to unlock it company-wide, then you can grant teammates.`
            : requestCompanyAdmin
              ? `Your account does not include ${moduleTitle}. Request access from your company admin.`
              : reason === "user_denied"
                ? `Your account does not include ${moduleTitle}.`
                : reason === "trial_exhausted"
                  ? `The ${moduleTitle} trial is used up. Update your package or enable the add-on to continue.`
                  : `${moduleTitle} is an add-on on your current package. Update the package to open it.`;

    const submitRequest = async () => {
        if (!accessToken || !accessModule || busy || pendingRequest || done) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            if (requestSuperAdmin) {
                await createOrgModuleUnlockRequest(accessToken, accessModule);
            } else {
                await createOrgModuleAccessRequest(accessToken, accessModule);
            }
            setDone(true);
            onRequested?.();
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay/60 p-4">
            <div className="w-full max-w-md rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 shadow-xl">
                <h2 className="text-label-lg text-strong-950">{title}</h2>
                <p className="mt-2 text-label-sm text-sub-600">{body}</p>
                {error ? (
                    <p className="mt-2 text-label-sm text-red-500">{error}</p>
                ) : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 rounded-xl px-4 text-label-sm text-sub-600 hover:bg-weak-50"
                    >
                        Close
                    </button>
                    {needsAccessRequest && !done && !pendingRequest ? (
                        <button
                            type="button"
                            disabled={busy || !accessToken}
                            onClick={() => void submitRequest()}
                            className="inline-flex h-10 items-center rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-50"
                        >
                            {busy
                                ? "Sending…"
                                : requestSuperAdmin
                                  ? "Request Super Admin"
                                  : "Request access"}
                        </button>
                    ) : null}
                    {!needsAccessRequest &&
                    reason !== "user_denied" &&
                    isCompanyAdmin ? (
                        <Link
                            href="/company/billing"
                            className="inline-flex h-10 items-center rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                        >
                            Go to billing
                        </Link>
                    ) : null}
                    {!needsAccessRequest &&
                    reason !== "user_denied" &&
                    !isCompanyAdmin ? (
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

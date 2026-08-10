"use client";

import { useEffect, useMemo, useState } from "react";

import QuotaBar from "@/components/Admin/QuotaBar";
import { useCompanyData } from "@/context/CompanyDataContext";
import {
    sharesSumTo100,
    userAllocation,
    userRemainingInSlice,
} from "@/lib/company/tokenMath";

const numberFormatter = new Intl.NumberFormat("en-US");

const UsagePage = () => {
    const {
        company,
        users,
        overflowTokens,
        saveTokenShares,
        releaseUnused,
        setCanUseOverflow,
    } = useCompanyData();

    const [draftShares, setDraftShares] = useState<Record<string, number>>({});
    const [shareError, setShareError] = useState<string | null>(null);
    const [shareSuccess, setShareSuccess] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    useEffect(() => {
        setDraftShares(
            Object.fromEntries(
                users.map((u) => [u.id, u.tokenSharePercent])
            )
        );
    }, [users]);

    const shareValues = useMemo(
        () => users.map((u) => draftShares[u.id] ?? u.tokenSharePercent),
        [draftShares, users]
    );
    const shareSum = shareValues.reduce((a, b) => a + b, 0);
    const sharesValid = sharesSumTo100(shareValues);

    const onShareChange = (userId: string, value: string) => {
        const parsed = value === "" ? 0 : Number(value);
        setDraftShares((prev) => ({
            ...prev,
            [userId]: Number.isFinite(parsed) ? parsed : 0,
        }));
        setShareError(null);
        setShareSuccess(null);
    };

    const onSaveShares = () => {
        if (!sharesValid) {
            setShareError(
                `Shares must sum to 100% (currently ${shareSum.toFixed(1)}%)`
            );
            setShareSuccess(null);
            return;
        }

        const result = saveTokenShares(draftShares);
        if (!result.ok) {
            setShareError(result.error ?? "Unable to save shares");
            setShareSuccess(null);
            return;
        }

        setShareError(null);
        setShareSuccess("Token shares saved");
    };

    const onRelease = (userId: string) => {
        const result = releaseUnused(userId);
        if (!result.ok) {
            setActionMessage(result.error ?? "Unable to release tokens");
            return;
        }
        const target = users.find((u) => u.id === userId);
        setActionMessage(
            target
                ? `Released unused tokens from ${target.email}`
                : "Released unused tokens"
        );
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Usage</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Company quotas, per-user token shares, and overflow pool.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">Company quotas</h2>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <QuotaBar
                        label="Tokens"
                        used={company.tokensUsed}
                        limit={company.tokenLimit}
                    />
                    <QuotaBar
                        label="Storage"
                        used={company.storageUsedGb}
                        limit={company.storageLimitGb}
                        unit="GB"
                    />
                </div>
                <p className="mt-4 text-label-sm text-sub-600">
                    Overflow pool:{" "}
                    <span className="text-strong-950">
                        {numberFormatter.format(overflowTokens)} tokens
                    </span>{" "}
                    available from released unused slices.
                </p>
            </section>

            {actionMessage && (
                <p className="text-label-sm text-sub-600">{actionMessage}</p>
            )}

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stroke-soft-200 p-5">
                    <div>
                        <h2 className="text-label-lg text-strong-950">
                            Token shares
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Allocate your company token limit across team members.
                            Shares must total 100%.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span
                            className={`text-label-sm ${sharesValid ? "text-sub-600" : "text-red-500"}`}
                        >
                            Total: {shareSum.toFixed(1)}%
                        </span>
                        <button
                            type="button"
                            onClick={onSaveShares}
                            className="h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0 transition-opacity hover:opacity-90"
                        >
                            Save shares
                        </button>
                    </div>
                </div>

                {shareError && (
                    <p className="border-b border-stroke-soft-200 px-5 py-3 text-label-sm text-red-500">
                        {shareError}
                    </p>
                )}
                {shareSuccess && (
                    <p className="border-b border-stroke-soft-200 px-5 py-3 text-label-sm text-green-600">
                        {shareSuccess}
                    </p>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Member</th>
                                <th className="px-5 py-3 font-medium">
                                    Share %
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Allocation
                                </th>
                                <th className="px-5 py-3 font-medium">Used</th>
                                <th className="px-5 py-3 font-medium">
                                    Remaining
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Overflow
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {users.map((user) => {
                                const share =
                                    draftShares[user.id] ??
                                    user.tokenSharePercent;
                                const allocation = userAllocation(
                                    company.tokenLimit,
                                    share
                                );
                                const remaining = userRemainingInSlice(
                                    allocation,
                                    user.tokensUsed,
                                    user.unusedReleased
                                );
                                const shareDirty =
                                    share !== user.tokenSharePercent;
                                const canRelease =
                                    !user.unusedReleased &&
                                    remaining > 0 &&
                                    !shareDirty;

                                return (
                                    <tr key={user.id} className="text-label-sm">
                                        <td className="px-5 py-4">
                                            <p className="text-strong-950">
                                                {user.name}
                                            </p>
                                            <p className="text-label-xs text-sub-600">
                                                {user.email}
                                            </p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                value={share}
                                                onChange={(e) =>
                                                    onShareChange(
                                                        user.id,
                                                        e.target.value
                                                    )
                                                }
                                                className="h-8 w-20 rounded-lg border border-stroke-soft-200 px-2 text-label-xs outline-none focus:border-blue-500"
                                            />
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(allocation)}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                user.tokensUsed
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {user.unusedReleased ? (
                                                <span className="text-label-xs text-sub-600">
                                                    Released
                                                </span>
                                            ) : (
                                                numberFormatter.format(remaining)
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <label className="inline-flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={user.canUseOverflow}
                                                    onChange={(e) =>
                                                        setCanUseOverflow(
                                                            user.id,
                                                            e.target.checked
                                                        )
                                                    }
                                                    className="h-4 w-4 rounded border-stroke-soft-200"
                                                />
                                                <span className="text-label-xs text-sub-600">
                                                    Allow
                                                </span>
                                            </label>
                                        </td>
                                        <td className="px-5 py-4">
                                            <button
                                                type="button"
                                                disabled={!canRelease}
                                                title={
                                                    shareDirty
                                                        ? "Save shares before releasing unused tokens"
                                                        : undefined
                                                }
                                                onClick={() =>
                                                    onRelease(user.id)
                                                }
                                                className="text-label-sm text-blue-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-sub-600 disabled:no-underline"
                                            >
                                                Release unused
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default UsagePage;

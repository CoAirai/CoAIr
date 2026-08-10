"use client";

import { useMemo, useState, type FormEvent } from "react";

import { useAdminData } from "@/context/AdminDataContext";
import { DEFAULT_OVERAGE_POLICY } from "@/lib/admin/billingDemoData";
import type { OverageMode, OveragePolicy } from "@/lib/admin/billingTypes";
import { overageUsdPer1kTokens } from "@/lib/billing/tokenEconomics";

const MODES: Array<{
    value: OverageMode;
    label: string;
    description: string;
}> = [
    {
        value: "block",
        label: "Block",
        description: "Stop additional token usage when the threshold is reached.",
    },
    {
        value: "throttle",
        label: "Throttle",
        description: "Reduce service capacity after the threshold is reached.",
    },
    {
        value: "bill",
        label: "Bill",
        description: "Continue service and charge for additional token usage.",
    },
];

const OveragePage = () => {
    const { tokenEconomics } = useAdminData();
    const derivedOverageRate = useMemo(
        () => overageUsdPer1kTokens(tokenEconomics.sellTokensPerUsd),
        [tokenEconomics.sellTokensPerUsd]
    );
    const [policy, setPolicy] = useState<OveragePolicy>({
        ...DEFAULT_OVERAGE_POLICY,
        overageRatePer1kTokensUsd: derivedOverageRate,
    });
    const [savedAt, setSavedAt] = useState<Date | null>(null);

    const updatePolicy = (updates: Partial<OveragePolicy>) => {
        setPolicy((current) => ({ ...current, ...updates }));
        setSavedAt(null);
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSavedAt(new Date());
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Overage policy</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Configure the default response when a company exceeds its token
                    quota.
                </p>
            </div>

            <div className="rounded-xl border border-stroke-soft-200 bg-weak-50 px-4 py-3 text-label-xs text-sub-600">
                Sell rate: {tokenEconomics.sellTokensPerUsd} tokens/$1 · Overage
                billing: ${derivedOverageRate.toFixed(2)} per 1,000 tokens (derived
                from sell rate on Tokens page)
            </div>

            <form
                onSubmit={handleSubmit}
                className="rounded-2xl border border-stroke-soft-200 bg-white-0"
            >
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Default behavior
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        This mock policy is stored only for the current page session.
                    </p>
                </div>

                <div className="space-y-6 p-5">
                    <fieldset>
                        <legend className="text-label-sm text-strong-950">
                            Overage mode
                        </legend>
                        <div className="mt-3 grid gap-3 lg:grid-cols-3">
                            {MODES.map((mode) => (
                                <label
                                    key={mode.value}
                                    className={`cursor-pointer rounded-xl border p-4 ${
                                        policy.mode === mode.value
                                            ? "border-blue-500 bg-blue-50"
                                            : "border-stroke-soft-200 hover:bg-weak-50"
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="overage-mode"
                                            value={mode.value}
                                            checked={policy.mode === mode.value}
                                            onChange={() =>
                                                updatePolicy({ mode: mode.value })
                                            }
                                            className="accent-blue-500"
                                        />
                                        <span className="text-label-sm text-strong-950">
                                            {mode.label}
                                        </span>
                                    </span>
                                    <span className="mt-2 block text-label-xs text-sub-600">
                                        {mode.description}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-label-xs text-sub-600">
                            Trigger threshold (%)
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                value={policy.triggerPct}
                                onChange={(event) =>
                                    updatePolicy({
                                        triggerPct: event.currentTarget.valueAsNumber,
                                    })
                                }
                                required
                                className="mt-2 h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                            />
                        </label>

                        <label className="block text-label-xs text-sub-600">
                            Overage rate per 1,000 tokens (USD)
                            <input
                                type="number"
                                readOnly
                                value={derivedOverageRate.toFixed(2)}
                                className="mt-2 h-10 w-full rounded-xl border border-stroke-soft-200 bg-weak-50 px-3 text-label-sm text-strong-950 outline-none"
                            />
                        </label>
                    </div>

                    <label className="block text-label-xs text-sub-600">
                        Notes
                        <textarea
                            value={policy.notes ?? ""}
                            onChange={(event) =>
                                updatePolicy({ notes: event.target.value })
                            }
                            rows={4}
                            className="mt-2 w-full resize-y rounded-xl border border-stroke-soft-200 bg-white-0 px-3 py-2 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                        />
                    </label>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-stroke-soft-200 p-5">
                    <button
                        type="submit"
                        className="h-10 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                    >
                        Save policy
                    </button>
                    {savedAt && (
                        <p role="status" className="text-label-xs text-sub-600">
                            Saved locally (mock)
                        </p>
                    )}
                </div>
            </form>
        </div>
    );
};

export default OveragePage;

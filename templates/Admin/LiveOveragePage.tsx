"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import type { OverageMode, OveragePolicy } from "@/lib/admin/billingTypes";
import { overageUsdPer1kTokens } from "@/lib/billing/tokenEconomics";
import { apiErrorMessage, readTokenEconomics } from "@/lib/coair/commerce";
import { readOveragePolicy, writeOveragePolicy } from "@/lib/coair/ops";

const MODES: Array<{
    value: OverageMode;
    label: string;
    description: string;
}> = [
    {
        value: "block",
        label: "Block",
        description:
            "Stop chat tokens and file uploads once usage reaches the trigger percent.",
    },
    {
        value: "throttle",
        label: "Throttle",
        description:
            "Warn after the trigger, but only hard-stop tokens/uploads at 100% of the package limit.",
    },
    {
        value: "bill",
        label: "Bill",
        description:
            "Keep serving tokens and accepting uploads past the limit so overage can be billed.",
    },
];

const LiveOveragePage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [sellRate, setSellRate] = useState(80);
    const [policy, setPolicy] = useState<OveragePolicy>({
        mode: "throttle",
        triggerPct: 100,
        notes: "",
    });
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        void Promise.all([readOveragePolicy(token), readTokenEconomics(token)])
            .then(([nextPolicy, economics]) => {
                setPolicy(nextPolicy);
                setSellRate(economics.sellTokensPerUsd);
                setError(null);
            })
            .catch((err) => setError(apiErrorMessage(err)));
    }, [token]);

    const derivedOverageRate = useMemo(
        () => overageUsdPer1kTokens(sellRate),
        [sellRate]
    );

    const updatePolicy = (updates: Partial<OveragePolicy>) => {
        setPolicy((current) => ({ ...current, ...updates }));
        setSavedAt(null);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        try {
            await writeOveragePolicy(token, policy);
            setSavedAt(new Date());
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Overage policy</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Configure what happens when a company hits its token or
                    storage quota threshold.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}

            <div className="rounded-xl border border-stroke-soft-200 bg-weak-50 px-4 py-3 text-label-xs text-sub-600">
                Applies to both token chat usage and file-upload storage.
                Sell rate: {sellRate} tokens/$1 · Overage billing reference: $
                {derivedOverageRate.toFixed(2)} per 1,000 tokens (from Tokens page).
            </div>

            <form
                onSubmit={(event) => void handleSubmit(event)}
                className="rounded-2xl border border-stroke-soft-200 bg-white-0"
            >
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Default behavior
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Saved to the live overage policy API.
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
                                className="mt-2 h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                            />
                        </label>
                        <label className="block text-label-xs text-sub-600">
                            Overage rate per 1,000 tokens (USD)
                            <input
                                type="number"
                                readOnly
                                value={derivedOverageRate.toFixed(2)}
                                className="mt-2 h-10 w-full rounded-xl border border-stroke-soft-200 bg-weak-50 px-3 text-label-sm"
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
                            className="mt-2 w-full resize-y rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm outline-none focus:border-blue-500"
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
                    {savedAt ? (
                        <p role="status" className="text-label-xs text-sub-600">
                            Saved
                        </p>
                    ) : null}
                </div>
            </form>
        </div>
    );
};

export default LiveOveragePage;

"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import type { ModuleAccess, ModuleId, Plan } from "@/lib/admin/types";
import { apiErrorMessage, listPackages, patchPackage } from "@/lib/coair/commerce";

const MODULES: { id: ModuleId; label: string }[] = [
    { id: "chatbot", label: "Module 1 · Chatbot" },
    { id: "chronology", label: "Module 2 · Chronology" },
    { id: "forensic", label: "Module 3 · Forensic Delay Analysis" },
];

const LivePackagesPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [plans, setPlans] = useState<Plan[]>([]);
    const [plansReady, setPlansReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setPlans([]);
            setPlansReady(true);
            return;
        }
        void listPackages(token)
            .then((rows) => setPlans(rows))
            .catch((err) => setError(apiErrorMessage(err)))
            .finally(() => setPlansReady(true));
    }, [token]);

    const save = useCallback(
        async (next: Plan) => {
            setPlans((prev) =>
                prev.map((plan) => (plan.id === next.id ? next : plan))
            );
            try {
                const saved = await patchPackage(token, next);
                setPlans((prev) =>
                    prev.map((plan) => (plan.id === saved.id ? saved : plan))
                );
                setError(null);
            } catch (err) {
                setError(apiErrorMessage(err));
            }
        },
        [token]
    );

    const patch = (plan: Plan, next: Partial<Omit<Plan, "id" | "modules">>) => {
        void save({ ...plan, ...next });
    };

    const patchModule = (
        plan: Plan,
        moduleId: ModuleId,
        access: ModuleAccess,
        trialReports?: number
    ) => {
        void save({
            ...plan,
            modules: {
                ...plan.modules,
                [moduleId]:
                    access === "trial"
                        ? { access, trialReports: trialReports ?? 1 }
                        : { access },
            },
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Packages</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Edit COAir packages.{" "}
                    <span className="text-strong-950">
                        Package price (USD / month)
                    </span>{" "}
                    is what Stripe charges at checkout. Price label is display
                    text only. Custom stays Super-Admin–assign only.
                </p>
            </div>
            {error ? <p className="text-label-sm text-red-500">{error}</p> : null}
            {plans.length === 0 ? (
                <p className="rounded-2xl border border-stroke-soft-200 bg-white-0 px-5 py-12 text-center text-label-sm text-sub-600">
                    {plansReady
                        ? "No packages configured yet."
                        : "Loading packages…"}
                </p>
            ) : null}

            <div className="space-y-4">
                {plans.map((plan) => (
                    <section
                        key={plan.id}
                        className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                    >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="text-label-lg text-strong-950">
                                {plan.name}
                            </h2>
                            <span className="text-label-xs text-sub-600">
                                {plan.id}
                            </span>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                            <Field
                                label="Price label (display)"
                                value={plan.priceLabel}
                                onChange={(value) =>
                                    patch(plan, { priceLabel: value })
                                }
                            />
                            <NumberField
                                label="Users included"
                                value={plan.usersIncluded}
                                onChange={(value) =>
                                    patch(plan, { usersIncluded: value })
                                }
                            />
                            <NumberField
                                label="S3 workspace (GB)"
                                value={plan.storageLimitGb}
                                onChange={(value) =>
                                    patch(plan, { storageLimitGb: value })
                                }
                            />
                            <NumberField
                                label="Package price (USD / month)"
                                value={plan.apiCreditsUsd}
                                onChange={(value) =>
                                    patch(plan, { apiCreditsUsd: value })
                                }
                            />
                            <NumberField
                                label="Token / query cap"
                                value={plan.queryCap}
                                onChange={(value) =>
                                    patch(plan, { queryCap: value })
                                }
                            />
                        </div>
                        {plan.id === "custom" ? (
                            <p className="mt-3 text-label-xs text-sub-600">
                                Custom is not shown in company onboarding or
                                self-serve upgrades. Super Admin assigns it to a
                                company from that company&apos;s detail page when
                                they need a non-standard package.
                            </p>
                        ) : null}
                        <div className="mt-5 grid gap-3 md:grid-cols-3">
                            {MODULES.map((module) => {
                                const rule = plan.modules[module.id];
                                return (
                                    <label
                                        key={module.id}
                                        className="block rounded-xl border border-stroke-soft-200 p-3"
                                    >
                                        <span className="mb-1.5 block text-label-xs text-sub-600">
                                            {module.label}
                                        </span>
                                        <select
                                            value={rule.access}
                                            onChange={(event) =>
                                                patchModule(
                                                    plan,
                                                    module.id,
                                                    event.target.value as ModuleAccess,
                                                    rule.trialReports
                                                )
                                            }
                                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                        >
                                            <option value="included">Included</option>
                                            <option value="trial">Trial</option>
                                            <option value="addon">Add-on</option>
                                        </select>
                                        {rule.access === "trial" ? (
                                            <input
                                                type="number"
                                                min={1}
                                                className="mt-2 h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                                value={rule.trialReports ?? 1}
                                                onChange={(event) =>
                                                    patchModule(
                                                        plan,
                                                        module.id,
                                                        "trial",
                                                        Number(event.target.value) || 1
                                                    )
                                                }
                                            />
                                        ) : null}
                                    </label>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
};

function Field({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-label-xs text-sub-600">{label}</span>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
            />
        </label>
    );
}

function NumberField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-label-xs text-sub-600">{label}</span>
            <input
                type="number"
                min={0}
                value={value}
                onChange={(event) =>
                    onChange(Math.max(0, Number(event.target.value) || 0))
                }
                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
            />
        </label>
    );
}

export default LivePackagesPage;

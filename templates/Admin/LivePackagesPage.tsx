"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminPackagesSkeleton } from "@/components/Skeleton/sections";
import { useAuth } from "@/context/AuthContext";
import { useAdminBadges } from "@/context/AdminBadgesContext";
import { planLabel } from "@/lib/admin/liveHelpers";
import type { ModuleAccess, ModuleId, Plan } from "@/lib/admin/types";
import { apiErrorMessage, listPackages, patchPackage } from "@/lib/coair/commerce";
import {
    approveAdminModuleUnlockRequest,
    approveAdminPackageChangeRequest,
    denyAdminModuleUnlockRequest,
    denyAdminPackageChangeRequest,
    listAdminModuleUnlockRequests,
    listAdminPackageChangeRequests,
    type ModuleAccessRequest,
    type PackageChangeRequest,
} from "@/lib/coair/ops";

const MODULES: { id: ModuleId; label: string }[] = [
    { id: "chatbot", label: "Module 1 · Chatbot" },
    { id: "chronology", label: "Module 2 · Chronology" },
    { id: "forensic", label: "Module 3 · Forensic Delay Analysis" },
];

const MODULE_UNLOCK_LABEL: Record<string, string> = {
    chronology: "Chronology",
    forensic: "Forensic",
};

const LivePackagesPage = () => {
    const { session } = useAuth();
    const { refresh: refreshBadges } = useAdminBadges();
    const token = session?.accessToken ?? "";
    const [plans, setPlans] = useState<Plan[]>([]);
    const [plansReady, setPlansReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [changeRequests, setChangeRequests] = useState<
        PackageChangeRequest[]
    >([]);
    const [unlockRequests, setUnlockRequests] = useState<ModuleAccessRequest[]>(
        []
    );
    const [resolveBusy, setResolveBusy] = useState<string | null>(null);
    const [resolveMessage, setResolveMessage] = useState<string | null>(null);

    const loadRequests = useCallback(async () => {
        if (!token) {
            setChangeRequests([]);
            setUnlockRequests([]);
            return;
        }
        try {
            const changes = await listAdminPackageChangeRequests(
                token,
                "pending"
            );
            setChangeRequests(changes);
        } catch (err) {
            setChangeRequests([]);
            setError(apiErrorMessage(err));
        }
        try {
            const unlocks = await listAdminModuleUnlockRequests(
                token,
                "pending"
            );
            setUnlockRequests(unlocks);
        } catch (err) {
            setUnlockRequests([]);
            setError(
                (prev) =>
                    prev ||
                    `Module unlock requests: ${apiErrorMessage(err)}`
            );
        }
    }, [token]);

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
        void loadRequests();
    }, [token, loadRequests]);

    const resolveRequest = async (
        id: string,
        action: "approved" | "denied"
    ) => {
        setResolveBusy(id);
        setResolveMessage(null);
        setError(null);
        try {
            if (action === "approved") {
                await approveAdminPackageChangeRequest(token, id);
                setResolveMessage("Package change approved and applied.");
            } else {
                await denyAdminPackageChangeRequest(token, id);
                setResolveMessage("Package change denied.");
            }
            await loadRequests();
            await refreshBadges();
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setResolveBusy(null);
        }
    };

    const resolveUnlockRequest = async (
        id: string,
        action: "approved" | "denied"
    ) => {
        setResolveBusy(id);
        setResolveMessage(null);
        setError(null);
        try {
            if (action === "approved") {
                await approveAdminModuleUnlockRequest(token, id);
                setResolveMessage(
                    "Module unlocked company-wide. Company admin can grant users."
                );
            } else {
                await denyAdminModuleUnlockRequest(token, id);
                setResolveMessage("Module unlock denied.");
            }
            await loadRequests();
            await refreshBadges();
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setResolveBusy(null);
        }
    };

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
        <div className="flex flex-col gap-8">
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
            {resolveMessage ? (
                <p className="text-label-sm text-green-600">{resolveMessage}</p>
            ) : null}

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">
                    Module unlock requests
                    {unlockRequests.length > 0
                        ? ` (${unlockRequests.length})`
                        : ""}
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Company admins request Chronology or Forensic company-wide.
                    Approve unlocks the module for that company so they can
                    grant teammates. Look here first — not on the company Users
                    rights grid.
                </p>
                {unlockRequests.length === 0 ? (
                    <p className="mt-4 text-label-sm text-sub-600">
                        No pending module unlock requests.
                    </p>
                ) : (
                    <ul className="mt-4 divide-y divide-stroke-soft-200">
                        {unlockRequests.map((row) => (
                            <li
                                key={row.id}
                                className="flex flex-wrap items-center justify-between gap-3 py-3"
                            >
                                <div>
                                    <p className="text-label-sm text-strong-950">
                                        {row.org_name || row.org_id}
                                    </p>
                                    <p className="text-label-xs text-sub-600">
                                        {MODULE_UNLOCK_LABEL[row.module] ||
                                            row.module}{" "}
                                        · {row.username}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={resolveBusy === row.id}
                                        onClick={() =>
                                            void resolveUnlockRequest(
                                                row.id,
                                                "approved"
                                            )
                                        }
                                        className="h-9 rounded-xl bg-strong-950 px-3 text-label-sm text-white-0 hover:opacity-90 disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        type="button"
                                        disabled={resolveBusy === row.id}
                                        onClick={() =>
                                            void resolveUnlockRequest(
                                                row.id,
                                                "denied"
                                            )
                                        }
                                        className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50 disabled:opacity-50"
                                    >
                                        Deny
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">
                    Downgrade requests
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Company admins cannot auto-downgrade. Approve to apply the
                    new package (carry remaining), or deny.
                </p>
                {changeRequests.length === 0 ? (
                    <p className="mt-4 text-label-sm text-sub-600">
                        No pending package change requests.
                    </p>
                ) : (
                    <ul className="mt-4 divide-y divide-stroke-soft-200">
                        {changeRequests.map((row) => (
                            <li
                                key={row.id}
                                className="flex flex-wrap items-center justify-between gap-3 py-3"
                            >
                                <div>
                                    <p className="text-label-sm text-strong-950">
                                        {row.org_name || row.org_id}
                                    </p>
                                    <p className="text-label-xs text-sub-600">
                                        {planLabel(row.from_plan_id)} →{" "}
                                        {planLabel(row.to_plan_id)} ·{" "}
                                        {row.username}
                                        {row.reason ? ` · ${row.reason}` : ""}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={resolveBusy === row.id}
                                        onClick={() =>
                                            void resolveRequest(
                                                row.id,
                                                "approved"
                                            )
                                        }
                                        className="h-9 rounded-xl bg-strong-950 px-3 text-label-sm text-white-0 hover:opacity-90 disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        type="button"
                                        disabled={resolveBusy === row.id}
                                        onClick={() =>
                                            void resolveRequest(row.id, "denied")
                                        }
                                        className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50 disabled:opacity-50"
                                    >
                                        Deny
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <AdminPackagesSkeleton loading={!plansReady && plans.length === 0}>
                <div className="space-y-4">
                    {plansReady && plans.length === 0 ? (
                        <p className="rounded-2xl border border-stroke-soft-200 bg-white-0 px-5 py-12 text-center text-label-sm text-sub-600">
                            No packages configured yet.
                        </p>
                    ) : null}

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
                            <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
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
                                    label="CA token allowance"
                                    value={plan.queryCap}
                                    onChange={(value) =>
                                        patch(plan, { queryCap: value })
                                    }
                                />
                            </div>
                            {plan.id === "custom" ? (
                                <p className="mt-3 text-label-xs text-sub-600">
                                    Custom is a template only. Super Admin sets
                                    company-specific limits when assigning — those
                                    freeze on the company. Editing this template
                                    does not change companies already on Custom.
                                </p>
                            ) : null}
                            {plan.id === "demo" ? (
                                <p className="mt-3 text-label-xs text-sub-600">
                                    Demo is Super Admin assign-only (not for sale).
                                    Companies get $20 of CA credits at no charge.
                                    Customers only see Foundation, Pro, and
                                    Enterprise.
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
                                                        event.target
                                                            .value as ModuleAccess,
                                                        rule.trialReports
                                                    )
                                                }
                                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                            >
                                                <option value="included">
                                                    Included
                                                </option>
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
                                                            Number(
                                                                event.target.value
                                                            ) || 1
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
            </AdminPackagesSkeleton>
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

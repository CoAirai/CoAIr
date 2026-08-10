"use client";

import { useState } from "react";

import StatusBadge from "@/components/Admin/StatusBadge";
import { DUNNING_CASES } from "@/lib/admin/billingDemoData";
import { extendGrace, retryDunning } from "@/lib/admin/billingSelectors";
import { COMPANIES } from "@/lib/admin/demoData";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const companyNameById = Object.fromEntries(
    COMPANIES.map((company) => [company.id, company.name])
);

const formatDate = (date: string) =>
    dateFormatter.format(new Date(`${date}T00:00:00`));

const DunningPage = () => {
    const [cases, setCases] = useState(DUNNING_CASES);

    const handleExtendGrace = (id: string) => {
        setCases((current) => extendGrace(current, id, 7));
    };

    const handleRetry = (id: string) => {
        setCases((current) => retryDunning(current, id));
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Dunning</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Manage failed-payment recovery and account grace periods.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Recovery cases
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Retry payment collection or extend a grace period by seven
                        days.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Failed</th>
                                <th className="px-5 py-3 font-medium">
                                    Grace ends
                                </th>
                                <th className="px-5 py-3 font-medium">Attempts</th>
                                <th className="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {cases.map((dunningCase) => (
                                <tr key={dunningCase.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {companyNameById[dunningCase.companyId] ??
                                            "Unknown"}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={dunningCase.status} />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {formatDate(dunningCase.failedAt)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {formatDate(dunningCase.graceEndsAt)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {dunningCase.attemptCount}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleRetry(dunningCase.id)
                                                }
                                                className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                            >
                                                Retry
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleExtendGrace(dunningCase.id)
                                                }
                                                className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50"
                                            >
                                                Extend grace (+7)
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {cases.length} dunning cases
                </div>
            </section>
        </div>
    );
};

export default DunningPage;

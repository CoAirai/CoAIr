"use client";

import { FormEvent, useMemo, useState } from "react";

import { AdminModelsSkeleton } from "@/components/Skeleton/sections";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";
import { patchAdminUser, type CoairBillingGroup } from "@/lib/coair/admin";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { formatCa } from "@/lib/billing/tokenEconomics";
import { useAuth } from "@/context/AuthContext";

const numberFormatter = new Intl.NumberFormat("en-US");

function taskLabel(task?: string) {
    if (!task) return "Other";
    return task.replaceAll("_", " ");
}

function modelRows(groups: CoairBillingGroup[]) {
    const byModel = new Map<
        string,
        { calls: number; tokens: number; ca: number }
    >();
    for (const group of groups) {
        const model = group.model || "Unknown model";
        const current = byModel.get(model) ?? { calls: 0, tokens: 0, ca: 0 };
        current.calls += group.calls ?? 0;
        current.tokens +=
            (group.prompt_tokens ?? 0) + (group.completion_tokens ?? 0);
        current.ca += group.retail_credit ?? group.estimated_provider_cost_usd ?? 0;
        byModel.set(model, current);
    }
    return Array.from(byModel.entries())
        .map(([model, stats]) => ({ model, ...stats }))
        .sort((a, b) => b.ca - a.ca || b.calls - a.calls);
}

const LiveModelsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { users, orgs, groups, loading, error, refresh } = useLiveAdmin();
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const models = useMemo(() => modelRows(groups), [groups]);
    const grantedMicros = useMemo(() => {
        return orgs.reduce((sum, org) => {
            const memberLimit = users
                .filter((user) => user.org_id === org.org_id)
                .reduce((total, user) => total + (user.token_limit ?? 0), 0);
            return sum + (org.default_token_limit || memberLimit || 0);
        }, 0);
    }, [orgs, users]);
    const limitLabel = `${formatCa(grantedMicros)} CA`;
    const taskRows = useMemo(
        () =>
            [...groups]
                .filter((group) => (group.calls ?? 0) > 0)
                .sort(
                    (a, b) =>
                        (b.retail_credit ?? b.estimated_provider_cost_usd ?? 0) -
                        (a.retail_credit ?? a.estimated_provider_cost_usd ?? 0)
                ),
        [groups]
    );
    const forensicRecorded = taskRows.some((group) =>
        (group.task_type ?? "").includes("forensic")
    );

    const onSave = async (event: FormEvent, username: string) => {
        event.preventDefault();
        const policy = drafts[username] ?? "";
        try {
            await patchAdminUser(token, username, { model_policy: policy });
            setMessage(`Saved model policy for ${username}`);
            setActionError(null);
            await refresh();
        } catch (err) {
            setMessage(null);
            setActionError(apiErrorMessage(err));
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-label-xl text-strong-950">Models</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live model policy per account. Rate-limit RPM caps from the mock
                    screen are not in the API.
                </p>
            </div>
            {error || actionError ? (
                <p className="text-label-sm text-red-500">
                    {actionError ?? error}
                </p>
            ) : null}
            {message ? (
                <p className="text-label-sm text-green-600">{message}</p>
            ) : null}
            <AdminModelsSkeleton loading={loading && users.length === 0}>
                <div className="flex flex-col gap-8">
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                        <div className="p-5">
                            <h2 className="text-label-lg text-strong-950">
                                Models in use
                            </h2>
                            <p className="mt-1 text-label-sm text-sub-600">
                                QUERIS, CHRONOS, and FORENSIS use gemini-3.6-flash.
                                Indexing and OCR use gemini-3.5-flash-lite. Each
                                row shows that model&apos;s recorded CA against
                                the granted usage limit.
                            </p>
                        </div>
                        {models.length === 0 ? (
                            <p className="px-5 pb-5 text-label-sm text-sub-600">
                                No model calls recorded yet.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px] text-left">
                                    <thead className="bg-weak-50 text-label-xs text-sub-600">
                                        <tr>
                                            <th className="px-5 py-3 font-medium">
                                                Model
                                            </th>
                                            <th className="px-5 py-3 font-medium">
                                                Calls
                                            </th>
                                            <th className="px-5 py-3 font-medium">
                                                Tokens
                                            </th>
                                            <th className="px-5 py-3 font-medium">
                                                CA used
                                            </th>
                                            <th className="px-5 py-3 font-medium">
                                                Usage limit
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stroke-soft-200">
                                        {models.map((row) => (
                                            <tr
                                                key={row.model}
                                                className="text-label-sm"
                                            >
                                                <td className="px-5 py-4 text-strong-950">
                                                    {row.model}
                                                </td>
                                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                                    {numberFormatter.format(
                                                        row.calls
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                                    {numberFormatter.format(
                                                        row.tokens
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                                    {formatCa(row.ca, false)} CA
                                                </td>
                                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                                    {limitLabel}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                        <div className="p-5">
                            <h2 className="text-label-lg text-strong-950">
                                Recorded by task
                            </h2>
                            <p className="mt-1 text-label-sm text-sub-600">
                                Chronology extract, synthesis, and verify land
                                on the first model. Forensic programme checks
                                do not call a model
                                {forensicRecorded
                                    ? ", except an optional narrative."
                                    : ", so they are not in this ledger."}
                            </p>
                        </div>
                        {taskRows.length === 0 ? (
                            <p className="px-5 pb-5 text-label-sm text-sub-600">
                                No task usage recorded yet.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px] text-left">
                                    <thead className="bg-weak-50 text-label-xs text-sub-600">
                                        <tr>
                                            <th className="px-5 py-3 font-medium">
                                                Task
                                            </th>
                                            <th className="px-5 py-3 font-medium">
                                                Model
                                            </th>
                                            <th className="px-5 py-3 font-medium">
                                                Calls
                                            </th>
                                            <th className="px-5 py-3 font-medium">
                                                CA used
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stroke-soft-200">
                                        {taskRows.map((group, index) => (
                                            <tr
                                                key={`${group.model}-${group.task_type}-${index}`}
                                                className="text-label-sm"
                                            >
                                                <td className="px-5 py-4 capitalize text-strong-950">
                                                    {taskLabel(group.task_type)}
                                                </td>
                                                <td className="px-5 py-4 text-sub-600">
                                                    {group.model || "—"}
                                                </td>
                                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                                    {numberFormatter.format(
                                                        group.calls ?? 0
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                                    {formatCa(
                                                        group.retail_credit ??
                                                            group.estimated_provider_cost_usd ??
                                                            0,
                                                        false
                                                    )}{" "}
                                                    CA
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-left">
                                <thead className="bg-weak-50 text-label-xs text-sub-600">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">User</th>
                                        <th className="px-5 py-3 font-medium">
                                            Company
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Model policy
                                        </th>
                                        <th className="px-5 py-3 font-medium">Save</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stroke-soft-200">
                                    {users.map((user) => (
                                        <tr key={user.username} className="text-label-sm">
                                            <td className="px-5 py-4 text-strong-950">
                                                {user.display_name ||
                                                    user.username}
                                            </td>
                                            <td className="px-5 py-4 text-sub-600">
                                                {user.org_name || "—"}
                                            </td>
                                            <td className="px-5 py-4">
                                                <input
                                                    value={
                                                        drafts[user.username] ??
                                                        user.model_policy ??
                                                        ""
                                                    }
                                                    onChange={(event) =>
                                                        setDrafts((current) => ({
                                                            ...current,
                                                            [user.username]:
                                                                event.target.value,
                                                        }))
                                                    }
                                                    className="h-10 w-full min-w-[220px] rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                                />
                                            </td>
                                            <td className="px-5 py-4">
                                                <form
                                                    onSubmit={(event) =>
                                                        void onSave(
                                                            event,
                                                            user.username
                                                        )
                                                    }
                                                >
                                                    <button
                                                        type="submit"
                                                        className="h-9 rounded-xl bg-strong-950 px-3 text-label-sm text-white-0"
                                                    >
                                                        Save
                                                    </button>
                                                </form>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </AdminModelsSkeleton>
        </div>
    );
};

export default LiveModelsPage;

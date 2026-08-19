"use client";

import { FormEvent, useState } from "react";

import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";
import { patchAdminUser } from "@/lib/coair/admin";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { useAuth } from "@/context/AuthContext";

const LiveModelsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { users, groups, loading, error, refresh } = useLiveAdmin();
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const modelsInUse = Array.from(
        new Set(groups.map((group) => group.model).filter(Boolean))
    ) as string[];

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
        <div className="space-y-6">
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
            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">Models in use</h2>
                <p className="mt-2 text-label-sm text-sub-600">
                    {modelsInUse.length > 0
                        ? modelsInUse.join(" · ")
                        : loading
                          ? "Loading usage…"
                          : "No model calls recorded yet."}
                </p>
            </section>
            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">User</th>
                                <th className="px-5 py-3 font-medium">Company</th>
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
                                        {user.display_name || user.username}
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
                                                void onSave(event, user.username)
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
                {loading && users.length === 0 ? (
                    <p className="px-5 py-8 text-label-sm text-sub-600">
                        Loading users…
                    </p>
                ) : null}
            </section>
        </div>
    );
};

export default LiveModelsPage;

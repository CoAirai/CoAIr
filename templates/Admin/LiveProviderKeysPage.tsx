"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import { useAuth } from "@/context/AuthContext";
import {
    assignAdminOrgProviderKey,
    createAdminProviderKey,
    listAdminOrgs,
    listAdminProviderKeys,
    revokeAdminProviderKey,
    type CoairAdminOrg,
    type CoairProviderKey,
} from "@/lib/coair/admin";
import { apiErrorMessage } from "@/lib/coair/commerce";

const numberFormatter = new Intl.NumberFormat("en-US");
const caFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
});
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
});

const LiveProviderKeysPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [keys, setKeys] = useState<CoairProviderKey[]>([]);
    const [orgs, setOrgs] = useState<CoairAdminOrg[]>([]);
    const [label, setLabel] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) {
            setKeys([]);
            setOrgs([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [keyPayload, orgPayload] = await Promise.all([
                listAdminProviderKeys(token),
                listAdminOrgs(token, false),
            ]);
            setKeys(keyPayload.keys ?? []);
            setOrgs(orgPayload.orgs ?? []);
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const activeOrgs = useMemo(
        () => orgs.filter((org) => !org.archived_at),
        [orgs]
    );

    const onCreate = async (event: FormEvent) => {
        event.preventDefault();
        if (!token || !label.trim()) return;
        setBusy(true);
        try {
            await createAdminProviderKey(token, label.trim());
            setLabel("");
            setMessage("Created Gemini sub-key");
            setError(null);
            await refresh();
        } catch (err) {
            setMessage(null);
            setError(apiErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const onAssign = async (keyRef: string, orgId: string) => {
        if (!token) return;
        setBusy(true);
        try {
            if (!orgId) {
                const current = keys.find((row) => row.key_ref === keyRef);
                const assignedId = current?.assigned_org?.org_id;
                if (assignedId) {
                    await assignAdminOrgProviderKey(token, assignedId, null);
                }
            } else {
                await assignAdminOrgProviderKey(token, orgId, keyRef);
            }
            setMessage(orgId ? "Assigned to company" : "Unassigned");
            setError(null);
            await refresh();
        } catch (err) {
            setMessage(null);
            setError(apiErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const onRevoke = async (keyRef: string) => {
        if (!token) return;
        if (!window.confirm(`Revoke ${keyRef}? Assigned companies will be cleared.`)) {
            return;
        }
        setBusy(true);
        try {
            await revokeAdminProviderKey(token, keyRef);
            setMessage("Key revoked");
            setError(null);
            await refresh();
        } catch (err) {
            setMessage(null);
            setError(apiErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Gemini keys"
                description="Virtual sub-keys under the VPS GOOGLE_API_KEY. Assign one per company to track CA, tokens, and call volume."
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            {message ? (
                <p className="text-label-sm text-green-600">{message}</p>
            ) : null}

            <form
                onSubmit={onCreate}
                className="surface-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
            >
                <label className="block flex-1">
                    <span className="mb-1.5 block text-label-xs text-sub-600">
                        Label
                    </span>
                    <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        placeholder="Acme Gemini"
                        required
                    />
                </label>
                <button
                    type="submit"
                    disabled={busy || !label.trim()}
                    className="h-10 rounded-full bg-strong-950 px-5 text-label-sm text-white-0 hover:opacity-90 disabled:opacity-50"
                >
                    {busy ? "Working…" : "Create key"}
                </button>
            </form>

            <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 px-5 py-4">
                    <h2 className="text-label-lg text-strong-950">
                        {loading
                            ? "Loading…"
                            : `${numberFormatter.format(keys.length)} keys`}
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Label</th>
                                <th className="px-5 py-3 font-medium">Key ref</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Calls</th>
                                <th className="px-5 py-3 font-medium">Tokens</th>
                                <th className="px-5 py-3 font-medium">CA</th>
                                <th className="px-5 py-3 font-medium">Provider $</th>
                                <th className="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {keys.map((row) => {
                                const usage = row.usage;
                                const tokens =
                                    (usage?.prompt_tokens ?? 0) +
                                    (usage?.completion_tokens ?? 0);
                                return (
                                    <tr key={row.key_ref} className="text-label-sm">
                                        <td className="px-5 py-4 text-strong-950">
                                            {row.label}
                                        </td>
                                        <td className="px-5 py-4 font-mono text-sub-600">
                                            {row.key_ref}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {row.status}
                                        </td>
                                        <td className="px-5 py-4">
                                            {row.status === "active" ? (
                                                <select
                                                    className="h-9 max-w-[220px] rounded-lg border border-stroke-soft-200 px-2 text-label-sm"
                                                    value={
                                                        row.assigned_org?.org_id ?? ""
                                                    }
                                                    disabled={busy}
                                                    onChange={(e) =>
                                                        void onAssign(
                                                            row.key_ref,
                                                            e.target.value
                                                        )
                                                    }
                                                >
                                                    <option value="">Unassigned</option>
                                                    {activeOrgs.map((org) => (
                                                        <option
                                                            key={org.org_id}
                                                            value={org.org_id}
                                                        >
                                                            {org.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="text-sub-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(usage?.calls ?? 0)}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(tokens)}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {caFormatter.format(usage?.ca_tokens ?? 0)}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {currencyFormatter.format(
                                                usage?.provider_cost_usd ?? 0
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex flex-wrap gap-2">
                                                <Link
                                                    href={`/admin/queries?provider_key_ref=${encodeURIComponent(row.key_ref)}`}
                                                    className="text-label-sm text-blue-600 hover:underline"
                                                >
                                                    Queries
                                                </Link>
                                                {row.status === "active" ? (
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void onRevoke(row.key_ref)
                                                        }
                                                        className="text-label-sm text-red-500 hover:underline disabled:opacity-50"
                                                    >
                                                        Revoke
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && keys.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="px-5 py-8 text-center text-label-sm text-sub-600"
                                    >
                                        No Gemini sub-keys yet. Create one above.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default LiveProviderKeysPage;

"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import Switch from "@/components/Switch";
import PreviewBanner from "@/components/Admin/PreviewBanner";
import { useAuth } from "@/context/AuthContext";
import { maskApiKey } from "@/lib/admin/wave2Helpers";
import type { ApiKeyRecord } from "@/lib/admin/wave2Types";
import { apiErrorMessage } from "@/lib/coair/commerce";
import {
    addSecurityIp,
    createSecurityApiKey,
    readSecurity,
    removeSecurityIp,
    revokeSecurityApiKey,
    writeSecurity,
    type LiveSecurity,
} from "@/lib/coair/ops";

const SESSION_TIMEOUTS = [
    { minutes: 30, label: "30 minutes" },
    { minutes: 60, label: "1 hour" },
    { minutes: 480, label: "8 hours" },
] as const;

const PREVIEW_IPS = ["203.0.113.10", "198.51.100.0/24"];
const PREVIEW_KEYS: ApiKeyRecord[] = [
    {
        id: "key-preview-1",
        label: "Billing sync",
        prefix: "coair_live_",
        lastFour: "9f2a",
        createdAt: "2026-08-01",
    },
    {
        id: "key-preview-2",
        label: "Usage exporter",
        prefix: "coair_live_",
        lastFour: "c418",
        createdAt: "2026-07-18",
    },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

function displayApiKey(record: ApiKeyRecord): string {
    return maskApiKey(
        `${record.prefix}${"0".repeat(10)}${record.lastFour.slice(-2)}`
    );
}

const LiveSecurityPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [security, setSecurity] = useState<LiveSecurity>({
        mfaRequired: false,
        sessionTimeoutMinutes: 30,
        ipAllowlist: [],
        apiKeys: [],
    });
    const [ipInput, setIpInput] = useState("");
    const [keyLabel, setKeyLabel] = useState("");
    const [revealedKey, setRevealedKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) return;
        try {
            setSecurity(await readSecurity(token));
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const persistPolicy = async (patch: Partial<LiveSecurity>) => {
        const next = { ...security, ...patch };
        setSecurity(next);
        try {
            await writeSecurity(token, {
                mfaRequired: next.mfaRequired,
                sessionTimeoutMinutes: next.sessionTimeoutMinutes,
            });
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const onAddIp = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = ipInput.trim();
        if (!trimmed) return;
        try {
            await addSecurityIp(token, trimmed);
            setIpInput("");
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const onCreateKey = async (event: FormEvent) => {
        event.preventDefault();
        try {
            const created = await createSecurityApiKey(token, keyLabel);
            setRevealedKey(created.full_key);
            setKeyLabel("");
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const previewIps = security.ipAllowlist.length === 0;
    const previewKeys = security.apiKeys.length === 0;
    const ips = previewIps ? PREVIEW_IPS : security.ipAllowlist;
    const keys = previewKeys ? PREVIEW_KEYS : security.apiKeys;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Security</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Manage MFA, session policy, IP allowlist, and platform API
                    keys.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            {previewIps || previewKeys ? <PreviewBanner /> : null}

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-xl">
                        <h2 className="text-label-lg text-strong-950">
                            Multi-factor authentication
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Require an extra verification step when company
                            admins sign in.
                        </p>
                    </div>
                    <Switch
                        checked={security.mfaRequired}
                        onChange={(checked) =>
                            void persistPolicy({ mfaRequired: checked })
                        }
                    />
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">
                    Session timeout
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Stored for operators. Sign-out enforcement stays in the
                    browser session for now.
                </p>
                <label className="mt-4 block max-w-xs">
                    <span className="mb-2 block text-label-xs text-sub-600">
                        Timeout
                    </span>
                    <select
                        value={security.sessionTimeoutMinutes}
                        onChange={(event) =>
                            void persistPolicy({
                                sessionTimeoutMinutes: Number(event.target.value),
                            })
                        }
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm outline-none focus:border-blue-500"
                    >
                        {SESSION_TIMEOUTS.map((option) => (
                            <option key={option.minutes} value={option.minutes}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        IP allowlist
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Stored for operators. Leave empty to allow all addresses.
                    </p>
                </div>
                <form
                    onSubmit={(event) => void onAddIp(event)}
                    className="flex flex-col gap-3 border-b border-stroke-soft-200 p-5 sm:flex-row"
                >
                    <input
                        type="text"
                        value={ipInput}
                        onChange={(event) => setIpInput(event.target.value)}
                        placeholder="192.168.1.0/24 or 203.0.113.42"
                        className="h-10 min-w-0 flex-1 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <button
                        type="submit"
                        className="h-10 shrink-0 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                    >
                        Add IP
                    </button>
                </form>
                <div className="space-y-2 p-5">
                    {ips.map((ip) => (
                            <div
                                key={ip}
                                className="flex items-center justify-between gap-3 rounded-xl border border-stroke-soft-200 px-4 py-3"
                            >
                                <span className="font-mono text-label-sm text-strong-950">
                                    {ip}
                                </span>
                                <button
                                    type="button"
                                    disabled={previewIps}
                                    onClick={() =>
                                        void removeSecurityIp(token, ip).then(refresh)
                                    }
                                    className="h-8 rounded-lg px-3 text-label-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">API keys</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Each key is shown in full only once at creation.
                    </p>
                </div>
                {revealedKey ? (
                    <div
                        role="alert"
                        className="mx-5 mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"
                    >
                        <p className="text-label-sm text-strong-950">
                            Copy your new API key now. You will not be able to
                            see it again.
                        </p>
                        <code className="mt-3 block break-all rounded-lg bg-white-0 px-3 py-2 font-mono text-label-sm text-strong-950">
                            {revealedKey}
                        </code>
                        <button
                            type="button"
                            onClick={() => setRevealedKey(null)}
                            className="mt-3 h-8 rounded-lg px-3 text-label-xs text-sub-600 hover:bg-white-0"
                        >
                            Dismiss
                        </button>
                    </div>
                ) : null}
                <form
                    onSubmit={(event) => void onCreateKey(event)}
                    className="flex flex-col gap-3 border-b border-stroke-soft-200 p-5 sm:flex-row"
                >
                    <input
                        type="text"
                        value={keyLabel}
                        onChange={(event) => setKeyLabel(event.target.value)}
                        placeholder="Key label (e.g. Billing sync)"
                        required
                        className="h-10 min-w-0 flex-1 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <button
                        type="submit"
                        className="h-10 shrink-0 rounded-xl bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                    >
                        Create key
                    </button>
                </form>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Label</th>
                                <th className="px-5 py-3 font-medium">Key</th>
                                <th className="px-5 py-3 font-medium">Created</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {keys.map((key) => (
                                <tr key={key.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {key.label}
                                    </td>
                                    <td className="px-5 py-4 font-mono text-sub-600">
                                        {displayApiKey(key)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateFormatter.format(
                                            new Date(
                                                key.createdAt.length <= 10
                                                    ? `${key.createdAt}T00:00:00`
                                                    : key.createdAt
                                            )
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        {key.revokedAt ? (
                                            <span className="text-label-xs text-red-600">
                                                Revoked
                                            </span>
                                        ) : (
                                            <span className="text-label-xs text-green-600">
                                                Active
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <button
                                            type="button"
                                            disabled={
                                                previewKeys || Boolean(key.revokedAt)
                                            }
                                            onClick={() =>
                                                void revokeSecurityApiKey(
                                                    token,
                                                    key.id
                                                ).then(refresh)
                                            }
                                            className="h-8 rounded-lg px-3 text-label-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                                        >
                                            Revoke
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {keys.length === 0 ? (
                    <p className="p-5 text-label-sm text-sub-600">
                        No API keys yet.
                    </p>
                ) : null}
            </section>
        </div>
    );
};

export default LiveSecurityPage;

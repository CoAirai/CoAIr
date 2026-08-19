"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { readPlatformUsage, type CoairUsageSnapshot } from "@/lib/coair/admin";
import { readSecurity, type LiveSecurity } from "@/lib/coair/ops";

const LiveSettingsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [security, setSecurity] = useState<LiveSecurity | null>(null);
    const [usage, setUsage] = useState<CoairUsageSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) return;
        try {
            const [nextSecurity, nextUsage] = await Promise.all([
                readSecurity(token),
                readPlatformUsage(token),
            ]);
            setSecurity(nextSecurity);
            setUsage(nextUsage);
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const sections = [
        {
            title: "Security",
            description: "Live values from /admin/security. Change them on the Security page.",
            href: "/admin/security",
            fields: [
                {
                    label: "MFA required",
                    value: security?.mfaRequired ? "Required" : "Optional",
                },
                {
                    label: "Session timeout",
                    value: security
                        ? `${security.sessionTimeoutMinutes} minutes`
                        : "—",
                },
                {
                    label: "IP allowlist entries",
                    value: String(security?.ipAllowlist.length ?? 0),
                },
                {
                    label: "API keys",
                    value: String(security?.apiKeys.length ?? 0),
                },
            ],
        },
        {
            title: "Usage budget",
            description: "Global LLM cost counter from /usage.",
            href: "/admin/analytics",
            fields: [
                {
                    label: "Used",
                    value: `$${(usage?.used_usd ?? 0).toFixed(2)}`,
                },
                {
                    label: "Limit",
                    value: `$${(usage?.limit_usd ?? 0).toFixed(2)}`,
                },
                {
                    label: "Remaining",
                    value: `$${(usage?.remaining_usd ?? 0).toFixed(2)}`,
                },
                {
                    label: "Calls",
                    value: String(usage?.total_calls ?? 0),
                },
            ],
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Settings</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live platform configuration. Storage provider and notification
                    prefs are not stored in the API.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <div className="grid gap-6 xl:grid-cols-2">
                {sections.map((section) => (
                    <section
                        key={section.title}
                        className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                    >
                        <h2 className="text-label-lg text-strong-950">
                            {section.title}
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            {section.description}
                        </p>
                        <div className="mt-5 space-y-4">
                            {section.fields.map((field) => (
                                <label
                                    key={field.label}
                                    className="block text-label-xs text-sub-600"
                                >
                                    {field.label}
                                    <input
                                        type="text"
                                        value={field.value}
                                        disabled
                                        className="mt-2 h-10 w-full rounded-xl border border-stroke-soft-200 bg-weak-50 px-3 text-label-sm text-sub-600 disabled:cursor-not-allowed"
                                    />
                                </label>
                            ))}
                        </div>
                        <Link
                            href={section.href}
                            className="mt-5 inline-flex h-10 items-center rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                        >
                            Open {section.title.toLowerCase()}
                        </Link>
                    </section>
                ))}
            </div>
        </div>
    );
};

export default LiveSettingsPage;

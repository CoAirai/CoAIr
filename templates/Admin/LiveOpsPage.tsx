"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import Switch from "@/components/Switch";
import { useAuth } from "@/context/AuthContext";
import type { Announcement, AnnouncementStatus, FeatureFlag } from "@/lib/admin/wave2Types";
import { apiErrorMessage } from "@/lib/coair/commerce";
import {
    addJargonTerm,
    applyFlywheel,
    deleteJargonTerm,
    listJargon,
    readDataTablesStatus,
    readFlywheelStatus,
    reindexDataTables,
    reloadJargon,
    resetPlatformUsage,
    type CoairDataTablesStatus,
    type CoairFlywheelStatus,
    type CoairJargonTerm,
} from "@/lib/coair/admin";
import {
    archiveAnnouncement,
    createAnnouncement,
    listAnnouncements,
    listFeatureFlags,
    publishAnnouncement,
    readMaintenance,
    writeFeatureFlag,
    writeMaintenance,
} from "@/lib/coair/ops";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const ANNOUNCEMENT_STATUS_CLASSES: Record<AnnouncementStatus, string> = {
    draft: "bg-weak-50 text-sub-600",
    published: "bg-green-500/10 text-green-600",
    archived: "bg-orange-500/10 text-orange-600",
};

const LiveOpsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [tables, setTables] = useState<CoairDataTablesStatus | null>(null);
    const [flywheel, setFlywheel] = useState<CoairFlywheelStatus | null>(null);
    const [customTerms, setCustomTerms] = useState<CoairJargonTerm[]>([]);
    const [builtinCount, setBuiltinCount] = useState(0);
    const [abbreviation, setAbbreviation] = useState("");
    const [fullForm, setFullForm] = useState("");
    const [flags, setFlags] = useState<FeatureFlag[]>([]);
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState("");
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) return;
        try {
            const [status, wheel, jargon, flagRows, maint, announcementRows] =
                await Promise.all([
                    readDataTablesStatus(token),
                    readFlywheelStatus(token),
                    listJargon(token),
                    listFeatureFlags(token),
                    readMaintenance(token),
                    listAnnouncements(token),
                ]);
            setTables(status);
            setFlywheel(wheel);
            setCustomTerms(jargon.custom ?? []);
            setBuiltinCount(jargon.builtin_count ?? 0);
            setFlags(flagRows);
            setMaintenanceMode(maint.mode);
            setMaintenanceMessage(maint.message);
            setAnnouncements(announcementRows);
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onAddTerm = async (event: FormEvent) => {
        event.preventDefault();
        try {
            await addJargonTerm(token, {
                abbreviation,
                full_form: fullForm,
            });
            setAbbreviation("");
            setFullForm("");
            setMessage("Jargon term saved");
            await refresh();
        } catch (err) {
            setMessage(null);
            setError(apiErrorMessage(err));
        }
    };

    const onCreateAnnouncement = async (event: FormEvent) => {
        event.preventDefault();
        try {
            await createAnnouncement(token, { title, body });
            setTitle("");
            setBody("");
            setMessage("Announcement drafted");
            await refresh();
        } catch (err) {
            setMessage(null);
            setError(apiErrorMessage(err));
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Ops</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Feature flags, maintenance, announcements, data-table repair,
                    learning flywheel, jargon, and platform usage reset.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            {message ? (
                <p className="text-label-sm text-green-600">{message}</p>
            ) : null}

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Feature flags
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Turn platform features on or off for all companies.
                    </p>
                </div>
                <div className="space-y-2 p-5">
                    {flags.map((flag) => (
                        <div
                            key={flag.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-stroke-soft-200 px-4 py-3"
                        >
                            <div>
                                <p className="text-label-sm text-strong-950">
                                    {flag.label}
                                </p>
                                <p className="mt-0.5 text-label-xs text-sub-600">
                                    {flag.key}
                                </p>
                            </div>
                            <Switch
                                checked={flag.enabled}
                                onChange={(enabled) =>
                                    void writeFeatureFlag(token, flag.id, enabled)
                                        .then(() => refresh())
                                        .catch((err) =>
                                            setError(apiErrorMessage(err))
                                        )
                                }
                            />
                        </div>
                    ))}
                    {flags.length === 0 ? (
                        <p className="text-label-sm text-sub-600">
                            No feature flags configured.
                        </p>
                    ) : null}
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-xl">
                        <h2 className="text-label-lg text-strong-950">
                            Maintenance mode
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            When enabled, companies see a maintenance message.
                        </p>
                    </div>
                    <Switch
                        checked={maintenanceMode}
                        onChange={(enabled) =>
                            void writeMaintenance(token, {
                                mode: enabled,
                                message: maintenanceMessage,
                            })
                                .then((result) => {
                                    setMaintenanceMode(result.mode);
                                    setMaintenanceMessage(result.message);
                                })
                                .catch((err) => setError(apiErrorMessage(err)))
                        }
                    />
                </div>
                <label className="mt-4 block">
                    <span className="mb-1.5 block text-label-xs text-sub-600">
                        Maintenance message
                    </span>
                    <textarea
                        rows={2}
                        value={maintenanceMessage}
                        onChange={(event) =>
                            setMaintenanceMessage(event.target.value)
                        }
                        onBlur={() =>
                            void writeMaintenance(token, {
                                mode: maintenanceMode,
                                message: maintenanceMessage,
                            }).catch((err) => setError(apiErrorMessage(err)))
                        }
                        disabled={!maintenanceMode}
                        className="w-full resize-none rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Message shown to companies while maintenance mode is active"
                    />
                </label>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Announcements
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Draft, publish, and archive announcements shown to
                        companies.
                    </p>
                </div>
                <form
                    onSubmit={(event) => void onCreateAnnouncement(event)}
                    className="grid gap-3 border-b border-stroke-soft-200 p-5"
                >
                    <input
                        required
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Scheduled maintenance window"
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <textarea
                        required
                        rows={3}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Details shown to company admins"
                        className="w-full resize-none rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm outline-none focus:border-blue-500"
                    />
                    <div>
                        <button
                            type="submit"
                            className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                        >
                            Create draft
                        </button>
                    </div>
                </form>
                <div className="divide-y divide-stroke-soft-200">
                    {announcements.map((announcement) => (
                        <div key={announcement.id} className="p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-label-sm text-strong-950">
                                            {announcement.title}
                                        </h3>
                                        <span
                                            className={`inline-flex h-6 items-center rounded-full px-2.5 text-label-xs ${
                                                ANNOUNCEMENT_STATUS_CLASSES[
                                                    announcement.status
                                                ]
                                            }`}
                                        >
                                            {announcement.status}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-label-xs text-sub-600">
                                        {dateFormatter.format(
                                            new Date(announcement.createdAt)
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4">
                                    {announcement.status === "draft" ? (
                                        <button
                                            type="button"
                                            className="text-label-sm text-blue-500"
                                            onClick={() =>
                                                void publishAnnouncement(
                                                    token,
                                                    announcement.id
                                                )
                                                    .then(() => refresh())
                                                    .catch((err) =>
                                                        setError(
                                                            apiErrorMessage(err)
                                                        )
                                                    )
                                            }
                                        >
                                            Publish
                                        </button>
                                    ) : null}
                                    {announcement.status !== "archived" ? (
                                        <button
                                            type="button"
                                            className="text-label-sm text-red-500"
                                            onClick={() =>
                                                void archiveAnnouncement(
                                                    token,
                                                    announcement.id
                                                )
                                                    .then(() => refresh())
                                                    .catch((err) =>
                                                        setError(
                                                            apiErrorMessage(err)
                                                        )
                                                    )
                                            }
                                        >
                                            Archive
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                            <p className="mt-2 text-label-sm text-sub-600">
                                {announcement.body}
                            </p>
                        </div>
                    ))}
                    {announcements.length === 0 ? (
                        <p className="p-5 text-label-sm text-sub-600">
                            No announcements yet.
                        </p>
                    ) : null}
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">Data tables</h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                        <dt className="text-label-xs text-sub-600">Files</dt>
                        <dd className="mt-1 text-label-sm text-strong-950">
                            {tables?.total_data_files ?? "—"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-label-xs text-sub-600">Registered</dt>
                        <dd className="mt-1 text-label-sm text-strong-950">
                            {tables?.registered ?? "—"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-label-xs text-sub-600">Pending</dt>
                        <dd className="mt-1 text-label-sm text-strong-950">
                            {tables?.pending ?? "—"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-label-xs text-sub-600">Errors</dt>
                        <dd className="mt-1 text-label-sm text-strong-950">
                            {tables?.error ?? "—"}
                        </dd>
                    </div>
                </dl>
                <button
                    type="button"
                    className="mt-5 h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                    onClick={() =>
                        void reindexDataTables(token)
                            .then((result) => {
                                setMessage(
                                    `Reindex scheduled for ${result.scheduled ?? 0} files`
                                );
                                return refresh();
                            })
                            .catch((err) => setError(apiErrorMessage(err)))
                    }
                >
                    Reindex unregistered files
                </button>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">Learning flywheel</h2>
                <p className="mt-1 text-label-sm text-sub-600">
                    Golden rows: {flywheel?.golden_rows ?? "—"} · Routing examples:{" "}
                    {flywheel?.learned_routing_examples ?? "—"}
                </p>
                <button
                    type="button"
                    className="mt-5 h-10 rounded-full border border-stroke-soft-200 px-4 text-label-sm text-strong-950"
                    onClick={() =>
                        void applyFlywheel(token)
                            .then(() => {
                                setMessage("Flywheel applied");
                                return refresh();
                            })
                            .catch((err) => setError(apiErrorMessage(err)))
                    }
                >
                    Apply flywheel
                </button>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">Jargon</h2>
                <p className="mt-1 text-label-sm text-sub-600">
                    {builtinCount} built-in terms · {customTerms.length} custom
                </p>
                <form
                    onSubmit={(event) => void onAddTerm(event)}
                    className="mt-4 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto]"
                >
                    <input
                        required
                        value={abbreviation}
                        onChange={(event) => setAbbreviation(event.target.value)}
                        placeholder="EOT"
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <input
                        required
                        value={fullForm}
                        onChange={(event) => setFullForm(event.target.value)}
                        placeholder="Extension of Time"
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <button
                        type="submit"
                        className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                    >
                        Add term
                    </button>
                </form>
                <div className="mt-4 divide-y divide-stroke-soft-200">
                    {customTerms.map((term) => (
                        <div
                            key={term.abbreviation}
                            className="flex items-center justify-between gap-3 py-3"
                        >
                            <p className="text-label-sm text-strong-950">
                                {term.abbreviation}{" "}
                                <span className="text-sub-600">
                                    · {term.full_form}
                                </span>
                            </p>
                            <button
                                type="button"
                                className="text-label-sm text-red-500"
                                onClick={() =>
                                    void deleteJargonTerm(token, term.abbreviation)
                                        .then(() => refresh())
                                        .catch((err) => setError(apiErrorMessage(err)))
                                }
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    className="mt-3 text-label-sm text-blue-500"
                    onClick={() =>
                        void reloadJargon(token)
                            .then((result) => {
                                setMessage(`Reloaded ${result.reloaded} terms`);
                                return refresh();
                            })
                            .catch((err) => setError(apiErrorMessage(err)))
                    }
                >
                    Reload from disk
                </button>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">
                    Platform usage counter
                </h2>
                <p className="mt-1 text-label-sm text-sub-600">
                    Resets the global LLM cost snapshot used on the dashboard.
                </p>
                <button
                    type="button"
                    className="mt-5 h-10 rounded-full border border-red-200 px-4 text-label-sm text-red-500"
                    onClick={() =>
                        void resetPlatformUsage(token)
                            .then(() => setMessage("Platform usage reset"))
                            .catch((err) => setError(apiErrorMessage(err)))
                    }
                >
                    Reset usage
                </button>
            </section>
        </div>
    );
};

export default LiveOpsPage;

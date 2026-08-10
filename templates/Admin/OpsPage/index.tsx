"use client";

import { FormEvent, useState } from "react";

import Switch from "@/components/Switch";
import { useAdminData } from "@/context/AdminDataContext";
import type { AnnouncementStatus } from "@/lib/admin/wave2Types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const ANNOUNCEMENT_STATUS_CLASSES: Record<AnnouncementStatus, string> = {
    draft: "bg-weak-50 text-sub-600",
    published: "bg-green-500/10 text-green-600",
    archived: "bg-orange-500/10 text-orange-600",
};

const OpsPage = () => {
    const {
        flags,
        setFlag,
        maintenanceMode,
        maintenanceMessage,
        setMaintenance,
        announcements,
        createAnnouncement,
        publishAnnouncement,
        archiveAnnouncement,
    } = useAdminData();

    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");

    const canCreate = title.trim().length > 0 && body.trim().length > 0;

    const onCreateAnnouncement = (event: FormEvent) => {
        event.preventDefault();
        if (!canCreate) return;
        createAnnouncement({ title, body });
        setTitle("");
        setBody("");
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Ops</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Control feature flags, platform maintenance, and
                    announcements to companies.
                </p>
            </div>

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
                                    setFlag(flag.id, enabled)
                                }
                            />
                        </div>
                    ))}
                    {flags.length === 0 && (
                        <p className="text-label-sm text-sub-600">
                            No feature flags configured.
                        </p>
                    )}
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-xl">
                        <h2 className="text-label-lg text-strong-950">
                            Maintenance mode
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            When enabled, companies see a maintenance message
                            instead of the app.
                        </p>
                    </div>
                    <Switch
                        checked={maintenanceMode}
                        onChange={(enabled) =>
                            setMaintenance(enabled, maintenanceMessage)
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
                        onChange={(e) =>
                            setMaintenance(maintenanceMode, e.target.value)
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
                    onSubmit={onCreateAnnouncement}
                    className="grid gap-3 border-b border-stroke-soft-200 p-5"
                >
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Title
                        </span>
                        <input
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Scheduled maintenance window"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Body
                        </span>
                        <textarea
                            required
                            rows={3}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Details shown to company admins"
                            className="w-full resize-none rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <div>
                        <button
                            type="submit"
                            disabled={!canCreate}
                            className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
                                            {announcement.status
                                                .charAt(0)
                                                .toUpperCase() +
                                                announcement.status.slice(1)}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-label-xs text-sub-600">
                                        {dateFormatter.format(
                                            new Date(announcement.createdAt)
                                        )}
                                        {announcement.publishedAt &&
                                            ` · Published ${dateFormatter.format(
                                                new Date(
                                                    announcement.publishedAt
                                                )
                                            )}`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4">
                                    {announcement.status === "draft" && (
                                        <button
                                            type="button"
                                            className="text-label-sm text-blue-500 hover:text-blue-600"
                                            onClick={() =>
                                                publishAnnouncement(
                                                    announcement.id
                                                )
                                            }
                                        >
                                            Publish
                                        </button>
                                    )}
                                    {announcement.status !== "archived" && (
                                        <button
                                            type="button"
                                            className="text-label-sm text-red-500 hover:text-red-600"
                                            onClick={() =>
                                                archiveAnnouncement(
                                                    announcement.id
                                                )
                                            }
                                        >
                                            Archive
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="mt-2 text-label-sm text-sub-600">
                                {announcement.body}
                            </p>
                        </div>
                    ))}
                    {announcements.length === 0 && (
                        <p className="p-5 text-label-sm text-sub-600">
                            No announcements yet.
                        </p>
                    )}
                </div>
            </section>
        </div>
    );
};

export default OpsPage;

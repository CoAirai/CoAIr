"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { ALERT_KIND_LABEL } from "@/lib/admin/alertFeed";
import {
    COMMAND_KIND_LABEL,
    matchCommandRecords,
} from "@/lib/admin/commandIndex";
import { useAdminChrome } from "@/lib/admin/useAdminChrome";

const AdminCommandBar = () => {
    const router = useRouter();
    const { records, alerts } = useAdminChrome();
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [alertsOpen, setAlertsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [modKey, setModKey] = useState("Ctrl");
    const searchRef = useRef<HTMLDivElement>(null);
    const alertsRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const hits = useMemo(
        () => matchCommandRecords(records, query),
        [query, records]
    );

    useEffect(() => {
        if (
            typeof navigator !== "undefined" &&
            /Mac|iPhone|iPad/.test(navigator.platform)
        ) {
            setModKey("⌘");
        }
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setAlertsOpen(false);
                setSearchOpen(true);
                inputRef.current?.focus();
            }
            if (event.key === "Escape") {
                setSearchOpen(false);
                setAlertsOpen(false);
                inputRef.current?.blur();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!searchRef.current?.contains(target)) {
                setSearchOpen(false);
            }
            if (!alertsRef.current?.contains(target)) {
                setAlertsOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, []);

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    const go = (href: string) => {
        setSearchOpen(false);
        setAlertsOpen(false);
        setQuery("");
        router.push(href);
    };

    return (
        <div className="flex min-w-0 grow items-center gap-2">
            <div ref={searchRef} className="relative min-w-0 grow">
                <Icon
                    className="pointer-events-none absolute top-1/2 left-3 z-[1] -translate-y-1/2 fill-sub-600"
                    name="search"
                />
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={(event) => {
                        if (!searchOpen || hits.length === 0) return;
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActiveIndex((index) =>
                                Math.min(index + 1, hits.length - 1)
                            );
                        }
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActiveIndex((index) => Math.max(index - 1, 0));
                        }
                        if (event.key === "Enter") {
                            event.preventDefault();
                            const hit = hits[activeIndex];
                            if (hit) go(hit.href);
                        }
                    }}
                    placeholder="Search companies, users, invoices, tickets"
                    aria-label="Search companies, users, invoices, and tickets"
                    aria-expanded={searchOpen && query.trim().length > 0}
                    aria-controls="admin-command-results"
                    className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 pr-16 pl-10 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-stroke-soft-200 px-1.5 py-0.5 text-label-xs text-sub-600">
                    {modKey === "⌘" ? "⌘K" : "Ctrl K"}
                </kbd>
                {searchOpen && query.trim() ? (
                    <div
                        id="admin-command-results"
                        role="listbox"
                        className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-30 overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0 shadow-[0_0.5rem_1.5rem_0_rgba(0,0,0,0.08)]"
                    >
                        {hits.length === 0 ? (
                            <p className="px-4 py-6 text-center text-label-sm text-sub-600">
                                No matches for “{query.trim()}”
                            </p>
                        ) : (
                            <ul>
                                {hits.map((hit, index) => (
                                    <li key={`${hit.kind}:${hit.id}`}>
                                        <button
                                            type="button"
                                            role="option"
                                            aria-selected={index === activeIndex}
                                            className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                                                index === activeIndex
                                                    ? "bg-weak-50"
                                                    : "hover:bg-weak-50/70"
                                            }`}
                                            onMouseEnter={() =>
                                                setActiveIndex(index)
                                            }
                                            onClick={() => go(hit.href)}
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-label-sm text-strong-950">
                                                    {hit.title}
                                                </span>
                                                <span className="block truncate text-label-xs text-sub-600">
                                                    {hit.subtitle}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-label-xs text-sub-600">
                                                {COMMAND_KIND_LABEL[hit.kind]}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : null}
            </div>

            <div ref={alertsRef} className="relative shrink-0">
                <button
                    type="button"
                    className="relative flex size-10 items-center justify-center rounded-xl border border-stroke-soft-200 bg-white-0 transition-colors hover:bg-weak-50"
                    aria-label={
                        alerts.length
                            ? `Alerts, ${alerts.length} pending`
                            : "Alerts"
                    }
                    aria-expanded={alertsOpen}
                    onClick={() => {
                        setSearchOpen(false);
                        setAlertsOpen((open) => !open);
                    }}
                >
                    <Icon className="fill-strong-950" name="bell" />
                    {alerts.length > 0 ? (
                        <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] leading-4 font-medium text-white-0">
                            {alerts.length > 9 ? "9+" : alerts.length}
                        </span>
                    ) : null}
                </button>
                {alertsOpen ? (
                    <div className="absolute top-[calc(100%+0.5rem)] right-0 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0 shadow-[0_0.5rem_1.5rem_0_rgba(0,0,0,0.08)]">
                        <div className="border-b border-stroke-soft-200 px-4 py-3">
                            <p className="text-label-sm text-strong-950">
                                Alerts
                            </p>
                            <p className="mt-0.5 text-label-xs text-sub-600">
                                Access requests, credit requests, tickets, and
                                past-due invoices.
                            </p>
                        </div>
                        {alerts.length === 0 ? (
                            <p className="px-4 py-8 text-center text-label-sm text-sub-600">
                                Nothing needs attention right now.
                            </p>
                        ) : (
                            <ul className="max-h-80 overflow-y-auto">
                                {alerts.map((alert) => (
                                    <li key={alert.id}>
                                        <button
                                            type="button"
                                            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-weak-50"
                                            onClick={() => go(alert.href)}
                                        >
                                            <span className="min-w-0">
                                                <span className="block text-label-sm text-strong-950">
                                                    {alert.title}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-label-xs text-sub-600">
                                                {ALERT_KIND_LABEL[alert.kind]}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default AdminCommandBar;

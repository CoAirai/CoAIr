import { useMemo, useState } from "react";
import type { ChronologyEvent, ChronologyEventSource } from "@/lib/chronology/events";
import SourceChip from "./SourceChip";

export type EventFilter = "all" | "delay" | "unreviewed";

type Props = {
    events: ChronologyEvent[];
    filter: EventFilter;
    onFilter: (filter: EventFilter) => void;
    selectedRef: string | null;
    activeSourceId: string | null;
    savingRefs: string[];
    canReview: boolean;
    onOpenSource: (event: ChronologyEvent, source: ChronologyEventSource) => void;
    onToggleReview: (event: ChronologyEvent) => void;
};

const COLLAPSED_SOURCES = 3;

function matches(event: ChronologyEvent, query: string) {
    if (!query) return true;
    const haystack = [
        event.eventId,
        event.dateLabel,
        event.summary,
        event.docType,
        event.parties,
        event.delay?.label ?? "",
        ...event.claims.map((claim) => claim.text),
        ...event.sources.map((source) => `${source.name} ${source.title}`),
    ]
        .join(" ")
        .toLowerCase();
    return haystack.includes(query.toLowerCase());
}

const EventTable = ({
    events,
    filter,
    onFilter,
    selectedRef,
    activeSourceId,
    savingRefs,
    canReview,
    onOpenSource,
    onToggleReview,
}: Props) => {
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const counts = {
        all: events.length,
        delay: events.filter((event) => event.delay).length,
        unreviewed: events.filter((event) => !event.reviewed).length,
    };
    const rows = useMemo(
        () =>
            events.filter(
                (event) =>
                    (filter === "all" ||
                        (filter === "delay" && event.delay) ||
                        (filter === "unreviewed" && !event.reviewed)) &&
                    matches(event, query.trim())
            ),
        [events, filter, query]
    );
    const tabs: [EventFilter, string][] = [
        ["all", "All"],
        ["delay", "▲ Delay-related"],
        ["unreviewed", "Needs review"],
    ];

    return (
        <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-stroke-soft-200 px-4 py-3">
                <div className="flex flex-wrap gap-1">
                    {tabs.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onFilter(value)}
                            className={`rounded-full px-3 py-1.5 text-label-sm transition-colors ${
                                filter === value
                                    ? "bg-strong-950 text-white-0"
                                    : "text-sub-600 hover:bg-weak-50"
                            }`}
                        >
                            {label}
                            <span className="ml-1 text-label-xs opacity-60">{counts[value]}</span>
                        </button>
                    ))}
                </div>
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search events, documents, parties"
                    className="ml-auto h-9 w-[280px] rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none focus:border-strong-950 max-md:ml-0 max-md:w-full"
                />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-separate border-spacing-0">
                    <thead>
                        <tr>
                            {["Event ID", "Date", "Event", "Record type", "Source reference", "Delay", "Verified"].map(
                                (header) => (
                                    <th
                                        key={header}
                                        className="whitespace-nowrap border-b border-stroke-soft-200 bg-weak-50 px-3.5 py-2.5 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-soft-400"
                                    >
                                        {header}
                                    </th>
                                )
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((event) => {
                            const selected = event.ref === selectedRef;
                            const saving = savingRefs.includes(event.ref);
                            const allSources = expanded[event.ref]
                                ? event.sources
                                : event.sources.slice(0, COLLAPSED_SOURCES);
                            const hidden = event.sources.length - allSources.length;
                            const details = event.claims.map((claim) => claim.text).join(" ");
                            const showDetails =
                                details.replace(/\.$/, "") !== event.summary.replace(/…$/, "");
                            return (
                                <tr
                                    key={event.ref}
                                    id={`chronology-row-${event.ref}`}
                                    onClick={() => event.sources[0] && onOpenSource(event, event.sources[0])}
                                    className={`cursor-pointer transition-colors ${
                                        selected ? "bg-weak-50" : "hover:bg-weak-50/60"
                                    }`}
                                >
                                    <td
                                        className={`border-b border-stroke-soft-200 px-3.5 py-3.5 align-top ${
                                            event.delay ? "shadow-[inset_3px_0_0_#F8A810]" : ""
                                        }`}
                                    >
                                        <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[12px] font-semibold text-strong-950">
                                            {!event.reviewed ? (
                                                <i
                                                    title="Needs review"
                                                    className="inline-block size-[7px] rounded-full bg-red-500"
                                                />
                                            ) : null}
                                            {event.eventId}
                                        </span>
                                    </td>
                                    <td className="border-b border-stroke-soft-200 px-3.5 py-3.5 align-top">
                                        <b
                                            className={`block whitespace-nowrap text-label-sm font-semibold ${
                                                event.dateInferred
                                                    ? "text-[#8A5200]"
                                                    : event.date
                                                      ? "text-strong-950"
                                                      : "text-soft-400"
                                            }`}
                                            title={event.dateInferred ? "Date inferred from context" : undefined}
                                        >
                                            {event.dateInferred ? `[${event.dateLabel}]` : event.dateLabel}
                                        </b>
                                    </td>
                                    <td className="border-b border-stroke-soft-200 px-3.5 py-3.5 align-top">
                                        <div className="max-w-[560px]">
                                            <b className="mb-0.5 block text-[13.5px] font-semibold text-strong-950">
                                                {event.summary}
                                            </b>
                                            {showDetails ? (
                                                <p className="text-label-sm leading-relaxed text-sub-600">
                                                    {details}
                                                </p>
                                            ) : null}
                                            {!event.reviewed ? (
                                                <small className="mt-1.5 inline-block text-label-xs font-semibold text-red-500">
                                                    Needs review
                                                </small>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="border-b border-stroke-soft-200 px-3.5 py-3.5 align-top text-label-sm text-sub-600">
                                        <span className="whitespace-nowrap">{event.docType}</span>
                                        {event.parties ? (
                                            <small className="mt-0.5 block max-w-[180px] text-label-xs text-soft-400">
                                                {event.parties}
                                            </small>
                                        ) : null}
                                    </td>
                                    <td className="border-b border-stroke-soft-200 px-3.5 py-3.5 align-top">
                                        <div className="flex max-w-[240px] flex-col items-start gap-1.5">
                                            {allSources.map((source) => (
                                                <SourceChip
                                                    key={source.srcId}
                                                    source={source}
                                                    active={activeSourceId === source.srcId && selected}
                                                    onOpen={(chosen) => onOpenSource(event, chosen)}
                                                />
                                            ))}
                                            {hidden > 0 ? (
                                                <button
                                                    type="button"
                                                    className="text-label-xs text-blue-500 hover:underline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpanded((value) => ({ ...value, [event.ref]: true }));
                                                    }}
                                                >
                                                    +{hidden} more
                                                </button>
                                            ) : null}
                                            {event.sources.length === 0 ? (
                                                <span className="text-label-xs text-soft-400">No source</span>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="border-b border-stroke-soft-200 px-3.5 py-3.5 align-top">
                                        {event.delay ? (
                                            <span
                                                title={`Matched: “${event.delay.evidence}”`}
                                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#F6D89A] bg-[#FFF6E6] px-2 py-0.5 text-label-xs font-semibold text-[#8A5200]"
                                            >
                                                ▲ {event.delay.label}
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className="border-b border-stroke-soft-200 px-3.5 py-3.5 align-top">
                                        <button
                                            type="button"
                                            disabled={!canReview || saving}
                                            aria-pressed={event.reviewed}
                                            title={
                                                event.reviewed
                                                    ? `Verified${event.reviewedBy ? ` by ${event.reviewedBy}` : ""}. Click to undo.`
                                                    : "Mark verified after checking the source"
                                            }
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleReview(event);
                                            }}
                                            className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-label-xs font-medium transition-colors disabled:opacity-50 ${
                                                event.reviewed
                                                    ? "border-green-200 bg-green-50 text-green-700"
                                                    : "border-stroke-soft-200 text-strong-950 hover:border-stroke-sub-300"
                                            }`}
                                        >
                                            {event.reviewed ? "✓ Verified" : "Verify"}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-label-sm text-soft-400">
                                    No events match this view.
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>
            <p className="border-t border-stroke-soft-200 px-4 py-3 text-label-xs text-soft-400">
                ▲ marks an entry whose wording relates to time — a notice, instruction, hold, programme
                change, determination or time language. It is not a finding that delay occurred or who is
                responsible. Click any row or reference to open the source document.
            </p>
        </section>
    );
};

export default EventTable;

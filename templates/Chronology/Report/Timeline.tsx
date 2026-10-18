import { useMemo, useState } from "react";
import type { ChronologyEvent } from "@/lib/chronology/events";

type Props = {
    events: ChronologyEvent[];
    selectedRef: string | null;
    onSelect: (event: ChronologyEvent) => void;
};

const WIDTH = 1100;
const LEFT = 16;
const RIGHT = 1084;
const AXIS = 28;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function eventTime(date: string): number | null {
    const match = date.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!match) return null;
    return Date.UTC(Number(match[1]), match[2] ? Number(match[2]) - 1 : 0, match[3] ? Number(match[3]) : 1);
}

function ticks(start: number, end: number): { time: number; label: string }[] {
    const from = new Date(start);
    const years = new Date(end).getUTCFullYear() - from.getUTCFullYear();
    const out: { time: number; label: string }[] = [];
    if (years >= 3) {
        const step = Math.max(1, Math.ceil(years / 12));
        for (let year = from.getUTCFullYear(); ; year += step) {
            const time = Date.UTC(year, 0, 1);
            if (time > end) break;
            if (time >= start) out.push({ time, label: String(year) });
        }
        return out;
    }
    const months = years * 12 + new Date(end).getUTCMonth() - from.getUTCMonth();
    const step = Math.max(1, Math.ceil(months / 14));
    for (let index = 0; ; index += step) {
        const time = Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + index, 1);
        if (time > end) break;
        if (time < start) continue;
        const date = new Date(time);
        const month = date.getUTCMonth();
        out.push({
            time,
            label: month === 0 || out.length === 0 ? `${MONTHS[month]} ${date.getUTCFullYear()}` : MONTHS[month],
        });
    }
    return out;
}

const Timeline = ({ events, selectedRef, onSelect }: Props) => {
    const [tip, setTip] = useState<{ x: number; y: number; event: ChronologyEvent } | null>(null);
    const points = useMemo(
        () =>
            events
                .map((event) => ({ event, time: eventTime(event.date) }))
                .filter((point): point is { event: ChronologyEvent; time: number } => point.time !== null),
        [events]
    );
    if (points.length < 2) return null;

    const first = Math.min(...points.map((point) => point.time));
    const last = Math.max(...points.map((point) => point.time));
    const pad = Math.max((last - first) * 0.03, 15 * 86400000);
    const start = first - pad;
    const end = last + pad;
    const x = (time: number) => LEFT + ((time - start) / (end - start)) * (RIGHT - LEFT);

    return (
        <section className="relative rounded-2xl border border-stroke-soft-200 bg-white-0 px-4 pb-2 pt-3">
            <svg
                viewBox={`0 0 ${WIDTH} 60`}
                preserveAspectRatio="none"
                className="block h-[60px] w-full overflow-visible"
                role="img"
                aria-label="Timeline of events"
            >
                <line x1={LEFT} x2={RIGHT} y1={AXIS} y2={AXIS} stroke="var(--stroke-soft-200)" strokeWidth={1.5} />
                {ticks(start, end).map((tick) => (
                    <g key={tick.time}>
                        <line
                            x1={x(tick.time)}
                            x2={x(tick.time)}
                            y1={AXIS - 4}
                            y2={AXIS + 4}
                            stroke="var(--text-soft-400)"
                            opacity=".6"
                        />
                        <text x={x(tick.time) + 4} y={AXIS + 22} fontSize={11} fill="var(--text-sub-600)">
                            {tick.label}
                        </text>
                    </g>
                ))}
                {/* Delay markers sit above the axis and are drawn last, so a record
                    dot on the same or a neighbouring date never hides them. */}
                {[...points]
                    .sort((a, b) => Number(Boolean(a.event.delay)) - Number(Boolean(b.event.delay)))
                    .map(({ event, time }) => {
                        const px = x(time);
                        const on = event.ref === selectedRef;
                        return (
                            <g
                                key={event.ref}
                                className="cursor-pointer"
                                onClick={() => onSelect(event)}
                                onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, event })}
                                onMouseLeave={() => setTip(null)}
                            >
                                {event.delay ? (
                                    <>
                                        <rect x={px - 9} y={AXIS - 26} width={18} height={20} fill="transparent" />
                                        <line
                                            x1={px}
                                            x2={px}
                                            y1={AXIS - 9}
                                            y2={AXIS}
                                            stroke="#F8A810"
                                            strokeWidth={1.5}
                                        />
                                        <path
                                            d={`M${px} ${AXIS - 24} L${px + 7} ${AXIS - 11} L${px - 7} ${AXIS - 11} Z`}
                                            fill="#F8A810"
                                            stroke={on ? "var(--strong-950)" : "#fff"}
                                            strokeWidth={1.5}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <rect x={px - 9} y={AXIS - 9} width={18} height={18} fill="transparent" />
                                        <circle
                                            cx={px}
                                            cy={AXIS}
                                            r={on ? 6.5 : 5}
                                            fill={on ? "var(--strong-950)" : "var(--text-soft-400)"}
                                            stroke="#fff"
                                            strokeWidth={1.5}
                                        />
                                    </>
                                )}
                            </g>
                        );
                    })}
            </svg>
            {tip ? (
                <div
                    className="pointer-events-none fixed z-30 max-w-[280px] rounded-lg bg-strong-950 px-2.5 py-1.5 text-[12px] leading-snug text-white-0"
                    style={{ left: tip.x + 14, top: tip.y - 8 }}
                >
                    <b className="text-[#F8A810]">
                        {tip.event.eventId} · {tip.event.dateLabel}
                    </b>
                    {tip.event.delay ? ` · ▲ ${tip.event.delay.label}` : ""}
                    <br />
                    {tip.event.summary}
                </div>
            ) : null}
            <p className="mt-1 text-[11px] text-soft-400">
                ● record &nbsp; <span className="text-[#F8A810]">▲</span> delay-related wording · click a point to open its source
            </p>
        </section>
    );
};

export default Timeline;

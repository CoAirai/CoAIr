"use client";

import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import millify from "millify";
import type { ChartPoint } from "@/lib/admin/dashboardSeries";

type ChartProps = {
    title: string;
    hint?: string;
    data: ChartPoint[];
    valuePrefix?: string;
    valueSuffix?: string;
    fillId?: string;
};

const formatTick = (value: number, prefix: string, suffix: string) => {
    if (value === 0) return `${prefix}0${suffix}`;
    return `${prefix}${millify(value, { lowercase: false })}${suffix}`;
};

const ChartTooltip = ({
    active,
    payload,
    label,
    prefix,
    suffix,
}: {
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
    prefix: string;
    suffix: string;
}) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-md bg-strong-950 px-2 py-1.5 text-label-xs text-white-0">
            {label}: {prefix}
            {payload[0].value.toLocaleString()}
            {suffix}
        </div>
    );
};

export const AdminAreaChart = ({
    title,
    hint,
    data,
    valuePrefix = "",
    valueSuffix = "",
    fillId = "adminAreaFill",
}: ChartProps) => (
    <section className="surface-panel p-5">
        <h2 className="text-label-lg text-strong-950">{title}</h2>
        {hint ? (
            <p className="mt-1 text-label-xs text-sub-600">{hint}</p>
        ) : null}
        <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient
                            id={fillId}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="#335CFF"
                                stopOpacity={0.16}
                            />
                            <stop
                                offset="95%"
                                stopColor="#335CFF"
                                stopOpacity={0}
                            />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        vertical={false}
                        strokeDasharray="5 2"
                        stroke="var(--stroke-soft-200)"
                    />
                    <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "var(--text-sub-600)" }}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={48}
                        tick={{ fontSize: 12, fill: "var(--text-sub-600)" }}
                        tickFormatter={(value: number) =>
                            formatTick(value, valuePrefix, valueSuffix)
                        }
                    />
                    <Tooltip
                        content={
                            <ChartTooltip
                                prefix={valuePrefix}
                                suffix={valueSuffix}
                            />
                        }
                        cursor={{
                            stroke: "var(--strong-950)",
                            strokeDasharray: "5 5",
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#335CFF"
                        strokeWidth={2}
                        fill={`url(#${fillId})`}
                        dot={false}
                        activeDot={{
                            r: 4,
                            fill: "var(--strong-950)",
                            stroke: "var(--white-0)",
                            strokeWidth: 2,
                        }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    </section>
);

export const AdminBarChart = ({
    title,
    hint,
    data,
    valuePrefix = "",
    valueSuffix = "",
}: ChartProps) => (
    <section className="surface-panel p-5">
        <h2 className="text-label-lg text-strong-950">{title}</h2>
        {hint ? (
            <p className="mt-1 text-label-xs text-sub-600">{hint}</p>
        ) : null}
        <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                    <CartesianGrid
                        vertical={false}
                        strokeDasharray="5 2"
                        stroke="var(--stroke-soft-200)"
                    />
                    <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "var(--text-sub-600)" }}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={48}
                        tick={{ fontSize: 12, fill: "var(--text-sub-600)" }}
                        tickFormatter={(value: number) =>
                            formatTick(value, valuePrefix, valueSuffix)
                        }
                    />
                    <Tooltip
                        content={
                            <ChartTooltip
                                prefix={valuePrefix}
                                suffix={valueSuffix}
                            />
                        }
                        cursor={{ fill: "var(--bg-weak-50)" }}
                    />
                    <Bar
                        dataKey="value"
                        fill="#335CFF"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={36}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    </section>
);

import { useState } from "react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";
import millify from "millify";
import Select from "@/components/Select";
import Icon from "@/components/Icon";

import { data } from "./data";

const durationOptions = [
    { id: 1, name: "Last 7 days" },
    { id: 2, name: "Last 14 days" },
    { id: 3, name: "Last 21 days" },
];

const Chart = ({}) => {
    const [duration, setDuration] = useState(durationOptions[0]);

    const formatterYAxis = (value: number) => {
        if (value === 0) {
            return "$0";
        }
        return `$${millify(value, {
            lowercase: false,
        })}`;
    };

    const CustomTooltip = ({ payload }: { payload: { value: number }[] }) => {
        if (payload && payload.length) {
            return (
                <div className="p-1.5 bg-strong-950 rounded-md text-label-xs text-white-0">
                    Bitcoin : ${payload[0].value}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="">
            <div className="border border-soft-200 px-4.5 py-3 rounded-lg max-md:px-3">
                <div className="flex items-center mb-2">
                    <div className="mr-auto text-h6">Bitcoin</div>
                    <div className="flex">
                        <Select
                            className=""
                            classButton="rounded-r-none max-md:rounded-lg"
                            value={duration}
                            onChange={setDuration}
                            options={durationOptions}
                        />
                        <div className="flex items-center gap-2 pl-2 pr-4 border-l-0 rounded-r-xl border border-stroke-soft-200 text-label-sm text-sub-600 max-md:hidden">
                            <Icon className="fill-sub-600" name="calendar" />
                            Oct 16 - Oct 22 2025
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 mb-4">
                    <div className="text-h5 max-md:text-[1.5rem]">$94,112</div>
                    <div className="flex items-center text-label-xs text-[#009934]">
                        <Icon
                            className="-rotate-90 !size-4 fill-[#009934]"
                            name="arrow"
                        />
                        12%
                    </div>
                    <div className="text-label-sm text-soft-400 max-md:hidden">
                        vs last Week
                    </div>
                </div>
                <div className="h-44 -ml-3">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            width={730}
                            height={250}
                            data={data}
                            margin={{ top: 10, right: 5, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient
                                    id="color"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0%"
                                        stopColor="#335CFF"
                                        stopOpacity={0.12}
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
                                strokeOpacity={0.5}
                            />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{
                                    fontSize: "0.875rem",
                                    fill: "var(--text-soft-400)",
                                }}
                                height={32}
                                dy={8}
                            />
                            <YAxis
                                tickFormatter={formatterYAxis}
                                axisLine={false}
                                tickLine={false}
                                tick={{
                                    fontSize: "0.875rem",
                                    fill: "var(--text-soft-400)",
                                }}
                            />
                            <Tooltip
                                content={<CustomTooltip payload={[]} />}
                                cursor={{
                                    stroke: "var(--strong-950)",
                                    strokeDasharray: "5 5",
                                }}
                            />
                            <Area
                                type="linear"
                                dataKey="tp"
                                stroke="#335CFF"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#color)"
                                dot={false}
                                activeDot={{
                                    r: 5,
                                    fill: "var(--strong-950)",
                                    stroke: "var(--white-0)",
                                    strokeWidth: 2,
                                }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Chart;

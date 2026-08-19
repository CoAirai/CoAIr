export type ChartPoint = {
    label: string;
    value: number;
};

export const TOKEN_SPEND_TREND: ChartPoint[] = [
    { label: "May 26", value: 1180 },
    { label: "Jun 9", value: 1420 },
    { label: "Jun 23", value: 1360 },
    { label: "Jul 7", value: 1680 },
    { label: "Jul 21", value: 1910 },
    { label: "Aug 4", value: 1740 },
    { label: "Aug 11", value: 2080 },
];

export const TOKEN_USAGE_TREND: ChartPoint[] = [
    { label: "Mon", value: 12400 },
    { label: "Tue", value: 18200 },
    { label: "Wed", value: 15600 },
    { label: "Thu", value: 22100 },
    { label: "Fri", value: 19800 },
    { label: "Sat", value: 9400 },
    { label: "Sun", value: 13100 },
];

export const STORAGE_GROWTH_TREND: ChartPoint[] = [
    { label: "Mar", value: 186 },
    { label: "Apr", value: 214 },
    { label: "May", value: 238 },
    { label: "Jun", value: 271 },
    { label: "Jul", value: 302 },
    { label: "Aug", value: 328 },
];

export const COMPANY_GROWTH_TREND: ChartPoint[] = [
    { label: "Mar", value: 4 },
    { label: "Apr", value: 5 },
    { label: "May", value: 6 },
    { label: "Jun", value: 7 },
    { label: "Jul", value: 8 },
    { label: "Aug", value: 9 },
];

export function barsFromNamedValues(
    rows: Array<{ name: string; value: number }>,
    limit = 7
): ChartPoint[] {
    return rows
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((row) => ({
            label: row.name.split(" ")[0] ?? row.name,
            value: row.value,
        }));
}

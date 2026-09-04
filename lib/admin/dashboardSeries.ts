export type ChartPoint = {
    label: string;
    value: number;
};

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

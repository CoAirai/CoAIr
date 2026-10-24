import type { SqlArtifact } from "./types";

/** Keep the database's column order and values, including empty results. */
export function sqlTable(artifact: SqlArtifact) {
    const columns = artifact.columns.length
        ? artifact.columns
        : Object.keys(artifact.preview_rows[0] ?? {});
    return {
        headers: columns,
        rows: artifact.preview_rows.map((row) =>
            columns.map((column) => sqlCell(row[column]))
        ),
    };
}

export function sqlCell(value: unknown): string {
    if (value == null) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function sqlChart(artifact: SqlArtifact) {
    const chart = artifact.chart;
    if (!chart || !["bar", "line"].includes(chart.type)) return null;
    const { headers } = sqlTable(artifact);
    if (!headers.includes(chart.x)) return null;
    const y = chart.y.filter((column) =>
        headers.includes(column) && artifact.preview_rows.some((row) =>
            typeof row[column] === "number" && Number.isFinite(row[column])
        )
    );
    return y.length ? { ...chart, y } : null;
}

/** Only suppress an exact duplicate; different analytical tables stay visible. */
export function repeatsSqlTable(headers: string[], rows: string[][], artifact: SqlArtifact): boolean {
    const table = sqlTable(artifact);
    return JSON.stringify([headers, rows]) === JSON.stringify([table.headers, table.rows]);
}

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

/** Suppress the same typed values, while preserving different analytical tables. */
export function repeatsSqlTable(headers: string[], rows: string[][], artifact: SqlArtifact): boolean {
    const table = sqlTable(artifact);
    if (headers.length !== table.headers.length || rows.length !== table.rows.length) return false;
    if (!headers.every((header, i) => header.trim().toLowerCase() === table.headers[i].trim().toLowerCase())) return false;
    return rows.every((row, i) => row.length === headers.length && row.every((cell, j) => {
        const value = artifact.preview_rows[i][table.headers[j]];
        const text = cell.trim();
        if (typeof value === "boolean") return text.toLowerCase() === String(value);
        if (typeof value === "number" && /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text)) {
            return Number(text.replaceAll(",", "")) === value;
        }
        return text === table.rows[i][j];
    }));
}

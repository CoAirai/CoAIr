import { describe, expect, it } from "vitest";
import { sqlCell, sqlChart, sqlTable, repeatsSqlTable } from "./sqlArtifact";
import type { SqlArtifact } from "./types";

const artifact: SqlArtifact = {
    generated_sql: 'SELECT date, amount, approved FROM costs',
    tables_used: ["costs"], row_count: 4,
    columns: ["date", "amount", "approved"],
    preview_rows: [{ approved: false, amount: 0, date: "2026-10-24" },
        { approved: true, amount: -12.5, date: "2026-10-25" },
        { approved: null, amount: 1000000000.25, date: "2026-10-26" }],
    source_file_id: "costs-source", source_file_name: "costs.xlsx",
    chart: { type: "line", x: "date", y: ["amount"] },
};

describe("structured SQL results", () => {
    it("retains SELECT order, zero, false, negative and precise values", () => {
        expect(sqlTable(artifact)).toEqual({ headers: artifact.columns, rows: [
            ["2026-10-24", "0", "false"], ["2026-10-25", "-12.5", "true"],
            ["2026-10-26", "1000000000.25", ""],
        ] });
    });
    it("retains headers for empty results rather than inventing data", () => {
        expect(sqlTable({ ...artifact, preview_rows: [], row_count: 0 })).toEqual({ headers: artifact.columns, rows: [] });
    });
    it("uses actual row keys only for legacy responses without ordered columns", () => {
        expect(sqlTable({ ...artifact, columns: [] }).headers).toEqual(["approved", "amount", "date"]);
    });
    it("does not coerce numeric strings or nonexistent fields into chart values", () => {
        expect(sqlChart(artifact)).toEqual(artifact.chart);
        expect(sqlChart({ ...artifact, chart: { type: "bar", x: "date", y: ["approved", "foreign"] } })).toBeNull();
        expect(sqlChart({ ...artifact, chart: { type: "bar", x: "foreign", y: ["amount"] } })).toBeNull();
        expect(sqlChart({ ...artifact, preview_rows: [{ date: "d", amount: "1,200" }] })).toBeNull();
    });
    it("removes only an exact repeated table while preserving different analysis", () => {
        const table = sqlTable(artifact);
        expect(repeatsSqlTable(table.headers, table.rows, artifact)).toBe(true);
        expect(repeatsSqlTable(["Total"], [["20"]], artifact)).toBe(false);
        expect(repeatsSqlTable(table.headers, table.rows.slice(0, 1), artifact)).toBe(false);
    });
    it("survives message persistence without dropping chart, totals or provenance", () => {
        const message = JSON.parse(JSON.stringify({ role: "assistant", content: "Result", sqlArtifact: artifact }));
        expect(message.sqlArtifact).toEqual(artifact);
        expect(message.sqlArtifact.row_count).toBe(4);
        expect(sqlCell({ a: "b" })).toBe('{"a":"b"}');
    });
});

import { describe, expect, it } from "vitest";
import { filterSortRows } from "./tableRows";

describe("interactive answer tables", () => {
    it("filters any column and sorts decimal values without changing retained rows", () => {
        const rows = [["Water main", "1.10"], ["Depot", "1.2"], ["Water main", "0"]];
        const original = JSON.stringify(rows);
        expect(filterSortRows(rows, "WATER", {column:1, descending:false})).toEqual([rows[2], rows[0]]);
        expect(filterSortRows(rows, "", {column:1, descending:true})).toEqual([rows[1], rows[0], rows[2]]);
        expect(JSON.stringify(rows)).toBe(original);
    });
    it("retains empty cells, false and no-result states", () => {
        expect(filterSortRows([["", "false"]], "false", null)).toEqual([["", "false"]]);
        expect(filterSortRows([["a"]], "missing", null)).toEqual([]);
    });
});

import { describe, expect, it, vi } from "vitest";
import { fetchDocContent, sourceRowAnchor } from "./documents";
import { coairFetch } from "./client";
vi.mock("./client", () => ({ coairFetch: vi.fn().mockResolvedValue({}) }));

describe("source row pagination", () => {
    it("keeps sheet names and bounded consecutive row ranges", () => {
        expect(sourceRowAnchor({sheet_name: "Period 01", row_from: 1, row_to: 50}, 1)).toBe("sheet_Period 01_rows_51_100");
        expect(sourceRowAnchor({sheet_name: "Period 01", row_from: 51, row_to: 73}, -1)).toBe("sheet_Period 01_rows_1_50");
        expect(sourceRowAnchor({sheet_name: "Period 01", row_from: 52, row_to: 101}, -1)).toBe("sheet_Period 01_rows_2_51");
    });
    it("keeps the authenticated project and source ID on page requests", async () => {
        await fetchDocContent("private-token", "project-a", "source-a", {anchor: "sheet_Period 01_rows_51_100", fileName: "Register.xlsx"});
        expect(coairFetch).toHaveBeenCalledWith("/docs/source-a/content?anchor=sheet_Period+01_rows_51_100&file_name=Register.xlsx", {token: "private-token", projectId: "project-a"});
    });
});

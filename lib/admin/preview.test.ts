import { describe, expect, it } from "vitest";
import { withPreview } from "./preview";

describe("withPreview", () => {
    it("keeps live rows when they exist", () => {
        expect(withPreview(["live"], ["mock"])).toEqual({
            rows: ["live"],
            preview: false,
        });
    });

    it("falls back to dummy rows when live is empty", () => {
        expect(withPreview([], ["mock"])).toEqual({
            rows: ["mock"],
            preview: true,
        });
    });

    it("does not swap in dummy rows until the live fetch is ready", () => {
        expect(withPreview([], ["mock"], false)).toEqual({
            rows: [],
            preview: false,
        });
    });
});

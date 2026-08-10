import { describe, expect, it } from "vitest";
import {
    buildProgrammeWorkspace,
    canCreateProgrammeWorkspace,
    MAX_PROGRAMME_SET_MB,
    totalProgrammeSizeMb,
} from "./intake";

describe("forensic intake", () => {
    it("blocks an empty selection and oversized sets", () => {
        expect(canCreateProgrammeWorkspace([])).toBe(false);
        expect(
            canCreateProgrammeWorkspace([{ sizeMb: MAX_PROGRAMME_SET_MB + 1 }])
        ).toBe(false);
        expect(canCreateProgrammeWorkspace([{ sizeMb: 12 }, { sizeMb: 14 }])).toBe(
            true
        );
        expect(totalProgrammeSizeMb([{ sizeMb: 12.4 }, { sizeMb: 14.1 }])).toBe(
            26.5
        );
    });

    it("builds a named workspace from selected programmes", () => {
        const workspace = buildProgrammeWorkspace({
            id: "fw-1",
            companyId: "co-001",
            name: "  Tram window  ",
            programmeIds: ["xer-1", "xer-2"],
            now: new Date("2026-08-05T10:00:00.000Z"),
        });
        expect(workspace.name).toBe("Tram window");
        expect(workspace.programmeIds).toEqual(["xer-1", "xer-2"]);
    });
});

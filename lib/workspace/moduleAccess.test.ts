import { describe, expect, it } from "vitest";
import { getPlanById } from "../admin/plans";
import { getModuleGate, moduleStatusLabel } from "./moduleAccess";

const demo = getPlanById("demo")!;
const pro = getPlanById("pro")!;

describe("getModuleGate", () => {
    it("opens chatbot on every package", () => {
        const gate = getModuleGate(
            demo,
            { addOns: [], trialUsage: {} },
            "chatbot"
        );
        expect(gate).toEqual({ state: "open", kind: "included" });
        expect(moduleStatusLabel(gate)).toBe("Live");
    });

    it("locks chronology/forensic until the company module is unlocked", () => {
        expect(
            getModuleGate(demo, { addOns: [], trialUsage: {} }, "chronology")
        ).toEqual({ state: "locked", reason: "addon" });
        expect(
            getModuleGate(pro, { addOns: [], trialUsage: {} }, "forensic")
        ).toEqual({ state: "locked", reason: "addon" });
    });

    it("opens chronology when the company grant is on", () => {
        const unlocked = getModuleGate(
            pro,
            { addOns: ["chronology"], trialUsage: {} },
            "chronology"
        );
        expect(unlocked).toEqual({ state: "open", kind: "addon" });
        expect(moduleStatusLabel(unlocked)).toBe("Live");
    });

    it("locks chronology when the user right is off after company unlock", () => {
        const gate = getModuleGate(
            demo,
            { addOns: ["chronology"], trialUsage: {} },
            "chronology",
            {
                features: {
                    projectAccess: true,
                    chronology: false,
                    forensic: false,
                    upload: true,
                    download: false,
                    reports: false,
                },
                role: "member",
            }
        );
        expect(gate).toEqual({ state: "locked", reason: "user_denied" });
        expect(moduleStatusLabel(gate)).toBe("Request access");
    });
});

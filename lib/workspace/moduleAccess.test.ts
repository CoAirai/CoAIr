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

    it("allows demo trial reports then locks", () => {
        const open = getModuleGate(
            demo,
            { addOns: [], trialUsage: {} },
            "chronology"
        );
        expect(open.state).toBe("open");
        if (open.state === "open") {
            expect(open.kind).toBe("trial");
            expect(open.trialRemaining).toBe(1);
        }

        const locked = getModuleGate(
            demo,
            { addOns: [], trialUsage: { chronology: 1 } },
            "chronology"
        );
        expect(locked).toEqual({ state: "locked", reason: "trial_exhausted" });
    });

    it("locks paid add-ons until enabled", () => {
        expect(
            getModuleGate(pro, { addOns: [], trialUsage: {} }, "forensic")
        ).toEqual({ state: "locked", reason: "addon" });

        const unlocked = getModuleGate(
            pro,
            { addOns: ["forensic"], trialUsage: {} },
            "forensic"
        );
        expect(unlocked).toEqual({ state: "open", kind: "addon" });
        expect(moduleStatusLabel(unlocked)).toBe("Live");
    });
});

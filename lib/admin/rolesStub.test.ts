import { describe, expect, it } from "vitest";
import {
    rightsForRole,
    rightsFromFeatures,
    roleRowsFromPeople,
    toggleRightInFeatures,
} from "./rolesStub";

describe("rightsForRole", () => {
    it("gives owners full rights", () => {
        expect(rightsForRole("owner").download).toBe(true);
        expect(rightsForRole("admin").forensic).toBe(true);
    });

    it("restricts viewers from upload and reports", () => {
        expect(rightsForRole("viewer").upload).toBe(false);
        expect(rightsForRole("viewer").reports).toBe(false);
    });
});

describe("roleRowsFromPeople", () => {
    it("stamps a rights matrix onto each person", () => {
        const rows = roleRowsFromPeople([
            {
                id: "u-1",
                name: "Ada",
                email: "ada@acme.example",
                companyName: "Acme",
                role: "admin",
            },
        ]);
        expect(rows[0].rights.projectAccess).toBe(true);
        expect(rows[0].companyName).toBe("Acme");
    });

    it("uses stored feature flags when present", () => {
        expect(
            rightsFromFeatures({ forensic: true, download: true }, "member")
                .forensic
        ).toBe(true);
        expect(rightsFromFeatures({}, "member").forensic).toBe(false);
    });
});

describe("toggleRightInFeatures", () => {
    it("keeps existing boolean flags when flipping one right", () => {
        const next = toggleRightInFeatures(
            { correspondence: true, forensic: false },
            "member",
            "forensic",
            true
        );
        expect(next.correspondence).toBe(true);
        expect(next.forensic).toBe(true);
        expect(next.download).toBe(false);
    });
});

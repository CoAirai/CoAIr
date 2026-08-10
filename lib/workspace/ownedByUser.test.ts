import { describe, expect, it } from "vitest";
import { ownedByUser } from "./ownedByUser";

describe("ownedByUser", () => {
    it("keeps only the active user's records", () => {
        const items = [
            { id: "a", ownerUserId: "u-001" },
            { id: "b", ownerUserId: "u-002" },
        ];
        expect(ownedByUser(items, "u-002").map((item) => item.id)).toEqual(["b"]);
        expect(ownedByUser(items, null)).toEqual(items);
    });
});

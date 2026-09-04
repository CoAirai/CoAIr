import { describe, expect, it } from "vitest";
import {
    companyStorageLimitBytes,
    companyStorageUsedBytes,
    gbToBytes,
} from "./liveHelpers";

describe("companyStorageLimitBytes", () => {
    it("never sums per-member limits", () => {
        expect(
            companyStorageLimitBytes({
                memberLimits: [gbToBytes(150), gbToBytes(150), gbToBytes(150)],
            })
        ).toBe(gbToBytes(150));
    });

    it("prefers the package catalog over stale org defaults", () => {
        expect(
            companyStorageLimitBytes({
                defaultStorageBytes: gbToBytes(20),
                planStorageGb: 150,
                memberLimits: [gbToBytes(20), gbToBytes(20)],
            })
        ).toBe(gbToBytes(150));
    });
});

describe("companyStorageUsedBytes", () => {
    it("sums used bytes across members", () => {
        expect(
            companyStorageUsedBytes([
                { storage_used_bytes: 100 },
                { storage_used_bytes: 50 },
            ])
        ).toBe(150);
    });
});

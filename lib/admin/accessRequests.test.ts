import { describe, expect, it } from "vitest";
import {
    approveAccessRequest,
    createAccessRequest,
    denyAccessRequest,
    pendingAccessRequests,
    type AccessRequest,
} from "./accessRequests";

const now = new Date("2026-08-05T08:00:00.000Z");

const request = (
    partial: Partial<AccessRequest> & Pick<AccessRequest, "id" | "email">
): AccessRequest => ({
    fullName: "Jordan Hale",
    companyName: "Hale Civil",
    createdAt: "2026-08-05T07:00:00.000Z",
    status: "pending",
    ...partial,
});

describe("createAccessRequest", () => {
    it("creates a pending company access request", () => {
        const result = createAccessRequest(
            [],
            [],
            {
                fullName: "Jordan Hale",
                email: "jordan@halecivil.com",
                companyName: "Hale Civil",
            },
            now
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.request).toMatchObject({
            fullName: "Jordan Hale",
            email: "jordan@halecivil.com",
            companyName: "Hale Civil",
            status: "pending",
            createdAt: now.toISOString(),
        });
        expect(result.request.id).toMatch(/^ar-/);
    });

    it("rejects missing fields and invalid email", () => {
        expect(
            createAccessRequest([], [], {
                fullName: " ",
                email: "jordan@halecivil.com",
                companyName: "Hale Civil",
            }).ok
        ).toBe(false);
        expect(
            createAccessRequest([], [], {
                fullName: "Jordan",
                email: "not-an-email",
                companyName: "Hale Civil",
            }).ok
        ).toBe(false);
        expect(
            createAccessRequest([], [], {
                fullName: "Jordan",
                email: "jordan@halecivil.com",
                companyName: " ",
            }).ok
        ).toBe(false);
    });

    it("rejects duplicate pending email or existing user email", () => {
        const existing = [
            request({ id: "ar-1", email: "jordan@halecivil.com" }),
        ];
        const duplicatePending = createAccessRequest(existing, [], {
            fullName: "Jordan Hale",
            email: "jordan@halecivil.com",
            companyName: "Hale Civil",
        });
        expect(duplicatePending).toEqual({
            ok: false,
            error: "A pending request already exists for this email",
        });

        const existingUser = createAccessRequest(
            [],
            [{ email: "ada@acmebuilders.com" }],
            {
                fullName: "Ada",
                email: "ada@acmebuilders.com",
                companyName: "Acme West",
            }
        );
        expect(existingUser).toEqual({
            ok: false,
            error: "This email already has a COAir account",
        });
    });
});

describe("approveAccessRequest", () => {
    it("approves a pending request for owner checkout", () => {
        const existing = [
            request({ id: "ar-1", email: "jordan@halecivil.com" }),
        ];
        const result = approveAccessRequest(existing, "ar-1", now);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.requests[0]).toMatchObject({
            id: "ar-1",
            status: "approved",
            resolvedAt: now.toISOString(),
        });
        expect(result.approval).toEqual({
            fullName: "Jordan Hale",
            email: "jordan@halecivil.com",
            companyName: "Hale Civil",
        });
    });

    it("rejects unknown or already resolved requests", () => {
        expect(approveAccessRequest([], "ar-missing").ok).toBe(false);
        expect(
            approveAccessRequest(
                [
                    request({
                        id: "ar-1",
                        email: "jordan@halecivil.com",
                        status: "denied",
                    }),
                ],
                "ar-1"
            ).ok
        ).toBe(false);
    });
});

describe("denyAccessRequest", () => {
    it("denies a pending request", () => {
        const result = denyAccessRequest(
            [request({ id: "ar-1", email: "jordan@halecivil.com" })],
            "ar-1",
            now
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.requests[0]).toMatchObject({
            status: "denied",
            resolvedAt: now.toISOString(),
        });
    });
});

describe("pendingAccessRequests", () => {
    it("returns only pending requests newest first", () => {
        const pending = pendingAccessRequests([
            request({
                id: "ar-old",
                email: "old@co.com",
                createdAt: "2026-08-01T00:00:00.000Z",
            }),
            request({
                id: "ar-denied",
                email: "no@co.com",
                status: "denied",
                createdAt: "2026-08-04T00:00:00.000Z",
            }),
            request({
                id: "ar-new",
                email: "new@co.com",
                createdAt: "2026-08-05T00:00:00.000Z",
            }),
        ]);
        expect(pending.map((item) => item.id)).toEqual(["ar-new", "ar-old"]);
    });
});

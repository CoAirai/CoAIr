import { describe, expect, it } from "vitest";
import { sendCoairEmail } from "./send";

describe("sendCoairEmail", () => {
    it("dry-runs when no API key is set", async () => {
        delete process.env.RESEND_API_KEY;
        const result = await sendCoairEmail({
            kind: "team_invite",
            to: "ben@acmebuilders.com",
            companyName: "Acme",
        });
        expect(result.ok).toBe(true);
        expect(result.mode).toBe("dry-run");
    });

    it("rejects a missing address", async () => {
        const result = await sendCoairEmail({
            kind: "password_reset",
            to: "not-an-email",
        });
        expect(result.ok).toBe(false);
    });
});

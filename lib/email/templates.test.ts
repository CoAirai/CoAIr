import { describe, expect, it } from "vitest";
import { buildEmail } from "./templates";

describe("email templates", () => {
    it("builds invite and reset messages", () => {
        const invite = buildEmail({
            kind: "team_invite",
            to: "ben@acmebuilders.com",
            name: "Ben",
            companyName: "Acme Builders",
            role: "member",
        });
        expect(invite.subject).toMatch(/Acme Builders/);
        expect(invite.text).toContain("Ben");
        expect(invite.html).toContain("Acme Builders");

        const reset = buildEmail({
            kind: "password_reset",
            to: "ada@acmebuilders.com",
            name: "Ada",
        });
        expect(reset.subject).toMatch(/Reset/i);
        expect(reset.text).toContain("/auth/reset-password");
    });

    it("marks resent invites", () => {
        const email = buildEmail({
            kind: "team_invite",
            to: "ben@acmebuilders.com",
            companyName: "Acme",
            isResend: true,
        });
        expect(email.subject).toMatch(/Reminder/i);
    });
});

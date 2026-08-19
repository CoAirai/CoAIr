import { describe, expect, it } from "vitest";
import { emailLogoUrl } from "./layout";
import { buildEmail } from "./templates";

describe("email templates", () => {
    it("builds branded invite and reset messages with logo", () => {
        const invite = buildEmail({
            kind: "team_invite",
            to: "ben@acmebuilders.com",
            name: "Ben",
            companyName: "Acme Builders",
            role: "member",
            temporaryPassword: "TempPass123!",
        });
        expect(invite.subject).toMatch(/Acme Builders/);
        expect(invite.text).toContain("Ben");
        expect(invite.html).toContain("Acme Builders");
        expect(invite.html).toContain(emailLogoUrl());
        expect(invite.html).toContain("Open COAir");
        expect(invite.html).toContain("TempPass123!");

        const reset = buildEmail({
            kind: "password_reset",
            to: "ada@acmebuilders.com",
            name: "Ada",
            resetToken: "abc123",
        });
        expect(reset.subject).toMatch(/Reset/i);
        expect(reset.text).toContain("token=abc123");
        expect(reset.html).toContain("Reset password");
        expect(reset.html).toContain(emailLogoUrl());
    });

    it("marks resent invites", () => {
        const email = buildEmail({
            kind: "team_invite",
            to: "ben@acmebuilders.com",
            companyName: "Acme",
            isResend: true,
        });
        expect(email.subject).toMatch(/Reminder/i);
        expect(email.html).toContain("Your invite is waiting");
    });

    it("builds owner and access emails", () => {
        const owner = buildEmail({
            kind: "owner_invite",
            to: "owner@acme.com",
            companyName: "Acme",
        });
        expect(owner.html).toContain("Your workspace is ready");

        const approved = buildEmail({
            kind: "access_approved",
            to: "owner@acme.com",
            companyName: "Acme",
        });
        expect(approved.html).toContain("You're approved");
    });
});

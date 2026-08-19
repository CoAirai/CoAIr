export type EmailKind =
    | "team_invite"
    | "owner_invite"
    | "access_request_received"
    | "access_approved"
    | "access_denied"
    | "password_reset";

export type EmailPayload = {
    kind: EmailKind;
    to: string;
    name?: string;
    companyName?: string;
    role?: string;
    isResend?: boolean;
    resetToken?: string;
    temporaryPassword?: string;
};

export type BuiltEmail = {
    kind: EmailKind;
    to: string;
    subject: string;
    text: string;
    html: string;
};

export type EmailSendResult = {
    ok: boolean;
    mode: "live" | "dry-run";
    id?: string;
    error?: string;
};

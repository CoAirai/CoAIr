"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { activateInvite, resendInviteCode } from "@/lib/coair/commerce";
import { CoairApiError } from "@/lib/coair/client";

const ERRORS: Record<string, string> = {
    invite_not_found: "No pending invite for this email",
    invite_already_activated: "This invite is already activated — sign in",
    email_not_verified: "Verify the email code first",
    email_verification_required: "Enter the 6-digit email code",
    email_verification_expired: "Code expired — request a new one",
    email_challenge_expired: "Code expired — request a new one",
    invalid_email_code: "That activation code is incorrect",
    invalid_email_challenge: "Request a new activation code",
    rate_limited: "Too many attempts — wait a minute and try again",
    supabase_sync_failed: "Could not finish account setup — try again",
};

function humanError(err: unknown) {
    if (err instanceof CoairApiError) {
        const clean = (err.body || err.message).replace(/^"|"$/g, "").trim();
        try {
            const parsed = JSON.parse(clean) as { detail?: string };
            if (parsed.detail) {
                return ERRORS[parsed.detail] ?? String(parsed.detail).replace(/_/g, " ");
            }
        } catch {
            /* plain */
        }
        return ERRORS[clean] ?? clean.replace(/_/g, " ");
    }
    return err instanceof Error ? err.message : "Activation failed";
}

const AcceptInvitePage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const emailFromQuery = useMemo(
        () => (searchParams.get("email") || "").trim().toLowerCase(),
        [searchParams]
    );
    const [email, setEmail] = useState(emailFromQuery);
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [debugCode, setDebugCode] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError("");
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }
        setBusy(true);
        try {
            await activateInvite({
                email: email.trim(),
                code: code.trim(),
                password,
            });
            setDone(true);
            window.setTimeout(() => {
                router.push("/auth/sign-in");
            }, 1400);
        } catch (err) {
            setError(humanError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleResend = async () => {
        setBusy(true);
        setError("");
        try {
            const resent = await resendInviteCode(email.trim());
            if (resent.debug_code) setDebugCode(resent.debug_code);
        } catch (err) {
            setError(humanError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <LayoutLogin
            title="Activate your invite"
            description={
                <>
                    Already activated?{" "}
                    <Link className="text-blue-500" href="/auth/sign-in">
                        Sign in
                    </Link>
                </>
            }
        >
            {done ? (
                <div className="surface-panel px-4 py-5 text-center text-label-sm text-sub-600">
                    <p className="font-medium text-strong-950">Invite activated</p>
                    <p className="mt-2 leading-relaxed">
                        Your email is verified. Taking you to sign in…
                    </p>
                </div>
            ) : (
                <form
                    className="flex flex-col gap-4.5"
                    onSubmit={(event) => void handleSubmit(event)}
                >
                    <Field
                        placeholder="Work email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />
                    <Field
                        placeholder="6-digit email code"
                        value={code}
                        onChange={(e) =>
                            setCode(
                                e.target.value.replace(/\D/g, "").slice(0, 6)
                            )
                        }
                        required
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                    />
                    <Field
                        placeholder="Create password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <Field
                        placeholder="Confirm password"
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    {debugCode ? (
                        <p className="text-label-xs text-amber-600">
                            Dev code: {debugCode}
                        </p>
                    ) : null}
                    {error ? (
                        <p className="text-label-sm text-red-500">{error}</p>
                    ) : null}
                    <Button
                        className="w-full !h-12 !rounded-xl"
                        isBlue
                        type="submit"
                        disabled={busy}
                    >
                        {busy ? "Activating…" : "Verify & set password"}
                    </Button>
                    <button
                        type="button"
                        className="text-label-sm text-blue-500"
                        disabled={busy || !email.trim()}
                        onClick={() => void handleResend()}
                    >
                        Resend activation code
                    </button>
                </form>
            )}
        </LayoutLogin>
    );
};

export default AcceptInvitePage;

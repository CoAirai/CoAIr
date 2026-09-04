"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import {
    createAccessRequest as createLiveAccessRequest,
    sendSignupEmailCode,
    verifySignupEmailCode,
} from "@/lib/coair/commerce";
import { CoairApiError } from "@/lib/coair/client";

const ACCESS_ERRORS: Record<string, string> = {
    pending_request_exists: "A pending request already exists for this email",
    invalid_email: "Valid work email required",
    full_name_required: "Full name required",
    company_name_required: "Company name required",
    email_already_registered: "This email already has a COAir account",
    email_not_verified: "Verify your email with the code we sent first",
    email_verification_required: "Verify your email with the code we sent first",
    email_verification_expired: "Email code expired — request a new one",
    email_challenge_expired: "Email code expired — request a new one",
    invalid_email_code: "That verification code is incorrect",
    invalid_email_challenge: "Request a new email verification code",
    rate_limited: "Too many attempts — wait a minute and try again",
    invite_not_activated:
        "Activate your invite first — check your email for the code",
};

function humanAccessError(code: string) {
    const clean = code.replace(/^"|"$/g, "").trim();
    try {
        const parsed = JSON.parse(clean) as { detail?: string };
        if (parsed.detail) {
            return ACCESS_ERRORS[parsed.detail] ?? String(parsed.detail).replace(/_/g, " ");
        }
    } catch {
        /* plain code */
    }
    return ACCESS_ERRORS[clean] ?? clean.replace(/_/g, " ");
}

function errorText(err: unknown) {
    if (err instanceof CoairApiError) {
        return humanAccessError(err.body || err.message);
    }
    return err instanceof Error ? err.message : "Request failed";
}

const SignUpPage = () => {
    const router = useRouter();
    const [step, setStep] = useState<"details" | "code">("details");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [company, setCompany] = useState("");
    const [challengeId, setChallengeId] = useState("");
    const [code, setCode] = useState("");
    const [debugCode, setDebugCode] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const sendCode = async () => {
        setBusy(true);
        setError("");
        try {
            const sent = await sendSignupEmailCode(email.trim());
            setChallengeId(sent.challenge_id);
            setDebugCode(sent.debug_code ?? null);
            setStep("code");
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(false);
        }
    };

    const handleDetails = async (event: FormEvent) => {
        event.preventDefault();
        await sendCode();
    };

    const handleVerify = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            const verified = await verifySignupEmailCode(
                challengeId,
                code.trim()
            );
            const live = await createLiveAccessRequest({
                fullName,
                email,
                companyName: company,
                emailVerificationToken: verified.verification_token,
            });
            if (!live.ok) {
                setError(humanAccessError(live.error));
                return;
            }
            setSubmitted(true);
            window.setTimeout(() => {
                router.push("/auth/sign-in");
            }, 1600);
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <LayoutLogin
            title="Request COAir access"
            description={
                <>
                    Already on a workspace?{" "}
                    <Link className="text-blue-500" href="/auth/sign-in">
                        Sign in
                    </Link>
                </>
            }
        >
            <div>
                {submitted ? (
                    <div className="surface-panel px-4 py-5 text-center text-label-sm text-sub-600">
                        <p className="font-medium text-strong-950">
                            Request sent to Super Admin
                        </p>
                        <p className="mt-2 leading-relaxed">
                            Your email is verified. Super Admin will review the
                            request, then you can sign in. Taking you there…
                        </p>
                    </div>
                ) : step === "details" ? (
                    <form
                        className="flex flex-col gap-4.5"
                        onSubmit={(event) => void handleDetails(event)}
                    >
                        <Field
                            placeholder="Full name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                        />
                        <Field
                            placeholder="Work email"
                            value={email}
                            type="email"
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <Field
                            placeholder="Company name"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            required
                        />
                        {error ? (
                            <p className="text-label-sm text-red-500">{error}</p>
                        ) : null}
                        <Button
                            className="w-full !h-12 !rounded-xl"
                            isBlue
                            type="submit"
                            disabled={busy}
                        >
                            {busy ? "Sending code…" : "Send email code"}
                        </Button>
                    </form>
                ) : (
                    <form
                        className="flex flex-col gap-4.5"
                        onSubmit={(event) => void handleVerify(event)}
                    >
                        <p className="text-label-sm text-sub-600">
                            We sent a 6-digit code to{" "}
                            <span className="text-strong-950">{email}</span>.
                            Enter it to prove this inbox is yours.
                        </p>
                        <Field
                            placeholder="Email verification code"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            required
                            autoComplete="one-time-code"
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
                            {busy ? "Submitting…" : "Verify & request access"}
                        </Button>
                        <button
                            type="button"
                            className="text-label-sm text-blue-500"
                            disabled={busy}
                            onClick={() => void sendCode()}
                        >
                            Resend code
                        </button>
                        <button
                            type="button"
                            className="text-label-sm text-sub-600"
                            disabled={busy}
                            onClick={() => {
                                setStep("details");
                                setCode("");
                                setError("");
                            }}
                        >
                            Change email
                        </button>
                    </form>
                )}
                <p className="mt-5 text-center text-label-sm text-sub-600">
                    Only real email addresses can request access. After Super
                    Admin approves, sign-in may also ask for a 2FA code.
                </p>
                <div className="mt-5 text-center">
                    <Link
                        className="text-label-sm text-blue-500 transition-colors hover:text-blue-700"
                        href="/auth/sign-in"
                    >
                        Back to sign in
                    </Link>
                </div>
            </div>
        </LayoutLogin>
    );
};

export default SignUpPage;

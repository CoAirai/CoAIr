"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAuth } from "@/context/AuthContext";
import { useAdminData } from "@/context/AdminDataContext";
import { postLoginUrl } from "@/lib/auth/postLoginPath";
import { portalNavigate } from "@/lib/auth/portalNav";
import { apiErrorMessage } from "@/lib/coair/commerce";
import {
    MFA_CHALLENGE_KEY,
    sessionFromAccessToken,
    type MfaChallenge,
} from "@/lib/coair/liveLogin";
import { verifyMfa } from "@/lib/coair/ops";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const EnterCodePage = () => {
    const router = useRouter();
    const { applySession } = useAuth();
    const { companies } = useAdminData();
    const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
    const [digits, setDigits] = useState(["", "", "", ""]);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(MFA_CHALLENGE_KEY);
            if (raw) {
                setChallenge(JSON.parse(raw) as MfaChallenge);
            }
        } catch {
            sessionStorage.removeItem(MFA_CHALLENGE_KEY);
        }
    }, []);

    const codeFromDigits = () => {
        const joined = digits.join("");
        if (digits[0].length === 4 && digits.slice(1).every((part) => !part)) {
            return digits[0];
        }
        return joined;
    };

    const handleMfa = async (event: FormEvent) => {
        event.preventDefault();
        if (!challenge) return;
        const code = codeFromDigits();
        if (code.length !== 4) {
            setError("Enter the 4-digit code");
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const verified = await verifyMfa(challenge.mfaToken, code);
            sessionStorage.removeItem(MFA_CHALLENGE_KEY);
            if (verified.refresh_token) {
                await getSupabaseBrowser()?.auth.setSession({
                    access_token: verified.access_token,
                    refresh_token: verified.refresh_token,
                });
            }
            const session = await sessionFromAccessToken(
                verified.access_token,
                verified.user
            );
            applySession(session);
            portalNavigate(router, postLoginUrl(session, companies));
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (challenge) {
        return (
            <LayoutLogin
                title="Enter the code"
                description={
                    <>Enter the 4-digit code sent for {challenge.username}.</>
                }
            >
                <form onSubmit={(event) => void handleMfa(event)}>
                    <div className="mb-5 flex gap-3">
                        {digits.map((value, index) => (
                            <Field
                                key={index}
                                className="flex-1"
                                classInput="h-20 !px-2 text-center !text-h3"
                                value={value}
                                maxLength={index === 0 ? 4 : 1}
                                onChange={(event) => {
                                    const next = [...digits];
                                    next[index] = event.target.value.replace(/\D/g, "");
                                    setDigits(next);
                                }}
                                required={index > 0 ? false : undefined}
                            />
                        ))}
                    </div>
                    {challenge.debugCode ? (
                        <p className="mb-4 text-center text-label-xs text-sub-600">
                            Sandbox code: {challenge.debugCode}
                        </p>
                    ) : null}
                    {error ? (
                        <p className="mb-3 text-label-sm text-red-500">{error}</p>
                    ) : null}
                    <Button
                        className="w-full !h-12 !rounded-xl"
                        isBlue
                        type="submit"
                        disabled={submitting}
                    >
                        {submitting ? "Verifying…" : "Continue"}
                    </Button>
                    <div className="mt-5 text-center">
                        <Link
                            className="text-label-sm text-blue-500 transition-colors hover:text-blue-700"
                            href="/auth/sign-in"
                        >
                            Back to sign in
                        </Link>
                    </div>
                </form>
            </LayoutLogin>
        );
    }

    return (
        <LayoutLogin
            title="Enter the code"
            description={
                <>Enter the 4-digit code from your COAir reset email.</>
            }
        >
            <div className="">
                <div className="mb-5 flex gap-3">
                    {digits.map((value, index) => (
                        <Field
                            key={index}
                            className="flex-1"
                            classInput="h-20 !px-2 text-center !text-h3"
                            value={value}
                            onChange={(event) => {
                                const next = [...digits];
                                next[index] = event.target.value;
                                setDigits(next);
                            }}
                            required
                        />
                    ))}
                </div>
                <Button
                    className="w-full !h-12 !rounded-xl"
                    isBlue
                    as="link"
                    href="/auth/reset-password"
                >
                    Continue
                </Button>
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

export default EnterCodePage;

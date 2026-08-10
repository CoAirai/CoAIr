"use client";

import { useState } from "react";
import Link from "next/link";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import { dispatchEmail } from "@/lib/email/dispatch";

const RESET_EMAIL_KEY = "coair.resetEmail";

const CheckEmailPage = () => {
    const [status, setStatus] = useState("");
    const [sending, setSending] = useState(false);

    const resend = async () => {
        const email = sessionStorage.getItem(RESET_EMAIL_KEY)?.trim();
        if (!email) {
            setStatus("Enter your email on the previous screen first.");
            return;
        }
        setSending(true);
        await dispatchEmail({
            kind: "password_reset",
            to: email,
            isResend: true,
        });
        setSending(false);
        setStatus(`Reset email queued for ${email}.`);
    };

    return (
        <LayoutLogin
            title="Check your email"
            description={
                <>We sent a COAir reset link to your work inbox.</>
            }
        >
            <>
                <Button
                    className="w-full !h-12 !rounded-xl"
                    isBlue
                    as="link"
                    href="/auth/enter-code"
                >
                    Enter the code manually
                </Button>
                <button
                    type="button"
                    className="mt-3 w-full text-label-sm text-blue-500 hover:text-blue-700"
                    onClick={() => void resend()}
                    disabled={sending}
                >
                    {sending ? "Resending…" : "Resend email"}
                </button>
                {status ? (
                    <p className="mt-3 text-center text-label-xs text-sub-600">
                        {status}
                    </p>
                ) : null}
                <div className="mt-5 text-center">
                    <Link
                        className="text-label-sm text-blue-500 transition-colors hover:text-blue-700"
                        href="/auth/sign-in"
                    >
                        Back to sign in
                    </Link>
                </div>
            </>
        </LayoutLogin>
    );
};

export default CheckEmailPage;

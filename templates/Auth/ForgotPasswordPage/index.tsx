"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { dispatchEmail } from "@/lib/email/dispatch";

const RESET_EMAIL_KEY = "coair.resetEmail";

const ForgotPasswordPage = () => {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setSending(true);
        sessionStorage.setItem(RESET_EMAIL_KEY, email.trim());
        await dispatchEmail({
            kind: "password_reset",
            to: email.trim(),
        });
        router.push("/auth/check-email");
    };

    return (
        <LayoutLogin
            title="Forgot password?"
            description={
                <>We’ll email a reset link for your COAir workspace.</>
            }
        >
            <div>
                <form className="flex flex-col gap-4.5" onSubmit={handleSubmit}>
                    <Field
                        placeholder="Work email"
                        value={email}
                        type="email"
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <Button
                        className="w-full !h-12 !rounded-xl"
                        isBlue
                        disabled={sending}
                    >
                        {sending ? "Sending…" : "Send reset link"}
                    </Button>
                </form>
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

export default ForgotPasswordPage;

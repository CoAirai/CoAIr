"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { isApiUnreachable } from "@/lib/coair/client";
import { RESET_EMAIL_KEY, RESET_TOKEN_KEY } from "@/lib/coair/liveLogin";
import { forgotPassword } from "@/lib/coair/ops";
import { dispatchEmail } from "@/lib/email/dispatch";

const ForgotPasswordPage = () => {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setSending(true);
        const username = email.trim();
        sessionStorage.setItem(RESET_EMAIL_KEY, username);
        sessionStorage.removeItem(RESET_TOKEN_KEY);
        try {
            const result = await forgotPassword(username);
            if (result.reset_token) {
                sessionStorage.setItem(RESET_TOKEN_KEY, result.reset_token);
            }
        } catch (error) {
            if (isApiUnreachable(error)) {
                await dispatchEmail({
                    kind: "password_reset",
                    to: username,
                });
            }
        }
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
                        placeholder="Username or work email"
                        value={email}
                        type="text"
                        autoComplete="username"
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

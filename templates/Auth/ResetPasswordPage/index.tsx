"use client";

import { useState } from "react";
import Link from "next/link";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";

const ResetPasswordPage = () => {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    return (
        <LayoutLogin
            title="Set a new password"
            description={<>Choose a new password for your COAir account.</>}
        >
            <div className="">
                <div className="flex flex-col gap-4.5">
                    <Field
                        placeholder="New password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                    />
                    <Field
                        placeholder="Confirm password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                    <Button
                        className="w-full !h-12 !rounded-xl"
                        isBlue
                        as="link"
                        href="/auth/sign-in"
                    >
                        Reset Password
                    </Button>
                </div>
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

export default ResetPasswordPage;

"use client";

import { useState } from "react";
import Link from "next/link";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";

const EnterCodePage = () => {
    const [number1, setNumber1] = useState("");
    const [number2, setNumber2] = useState("");
    const [number3, setNumber3] = useState("");
    const [number4, setNumber4] = useState("");

    return (
        <LayoutLogin
            title="Enter the code"
            description={
                <>Enter the 4-digit code from your COAir reset email.</>
            }
        >
            <div className="">
                <div className="flex gap-3 mb-5">
                    <Field
                        className="flex-1"
                        classInput="h-20 !px-2 text-center !text-h3"
                        value={number1}
                        onChange={(e) => setNumber1(e.target.value)}
                        required
                    />
                    <Field
                        className="flex-1"
                        classInput="h-20 !px-2 text-center !text-h3"
                        value={number2}
                        onChange={(e) => setNumber2(e.target.value)}
                        required
                    />
                    <Field
                        className="flex-1"
                        classInput="h-20 !px-2 text-center !text-h3"
                        value={number3}
                        onChange={(e) => setNumber3(e.target.value)}
                        required
                    />
                    <Field
                        className="flex-1"
                        classInput="h-20 !px-2 text-center !text-h3"
                        value={number4}
                        onChange={(e) => setNumber4(e.target.value)}
                        required
                    />
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

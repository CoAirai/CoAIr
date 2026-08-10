"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "@/components/Image";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { getPlanById } from "@/lib/admin/plans";
import type { PlanId } from "@/lib/admin/types";
import { validateDummyPayment } from "@/lib/billing/checkout";

const CheckoutPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { session } = useAuth();
    const { plans, completeCompanyCheckout } = useAdminData();
    const planId = (searchParams.get("plan") ?? "foundation") as PlanId;
    const plan = useMemo(() => getPlanById(planId, plans), [planId, plans]);
    const [name, setName] = useState(session?.name ?? "");
    const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
    const [expiry, setExpiry] = useState("12/28");
    const [cvc, setCvc] = useState("123");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (!session?.companyId || !plan) {
            setError("Missing company or plan");
            return;
        }
        const valid = validateDummyPayment({
            name,
            cardNumber,
            expiry,
            cvc,
        });
        if (!valid.ok) {
            setError(valid.error);
            return;
        }
        setBusy(true);
        const result = completeCompanyCheckout(session.companyId, plan.id);
        if (!result.ok) {
            setBusy(false);
            setError(result.error ?? "Payment failed");
            return;
        }
        router.replace("/workspace");
    };

    if (!plan) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-weak-50 text-sub-600">
                Unknown package.{" "}
                <Link className="ml-1 text-blue-500" href="/onboarding/plans">
                    Choose again
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-weak-50 px-6 py-10">
            <div className="mx-auto max-w-xl">
                <Image
                    className="mb-8 h-8 w-auto rounded-xl object-contain opacity-100"
                    src="/images/coair-logo.png"
                    width={120}
                    height={32}
                    alt="COAir"
                />
                <p className="text-[11px] uppercase tracking-[0.18em] text-soft-400">
                    Dummy checkout · Stripe later
                </p>
                <h1 className="mt-2 text-h3 text-strong-950">
                    Pay for {plan.name}
                </h1>
                <p className="mt-2 text-label-sm text-sub-600">
                    No real charge. Any complete card details will unlock the
                    workspace.
                </p>

                <form
                    onSubmit={onSubmit}
                    className="mt-6 space-y-4 rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                >
                    <Field
                        placeholder="Cardholder name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                    />
                    <Field
                        placeholder="Card number"
                        value={cardNumber}
                        onChange={(event) => setCardNumber(event.target.value)}
                        required
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            placeholder="MM/YY"
                            value={expiry}
                            onChange={(event) => setExpiry(event.target.value)}
                            required
                        />
                        <Field
                            placeholder="CVC"
                            value={cvc}
                            onChange={(event) => setCvc(event.target.value)}
                            required
                        />
                    </div>
                    {error ? (
                        <p className="text-label-sm text-red-500">{error}</p>
                    ) : null}
                    <Button
                        className="w-full !h-12 !rounded-xl"
                        isBlue
                        type="submit"
                        disabled={busy}
                    >
                        {busy ? "Processing…" : `Pay ${plan.priceLabel} · dummy`}
                    </Button>
                    <Link
                        href="/onboarding/plans"
                        className="block text-center text-label-sm text-blue-500"
                    >
                        Back to packages
                    </Link>
                </form>
            </div>
        </div>
    );
};

export default CheckoutPage;

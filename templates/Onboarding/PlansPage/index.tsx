"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/Image";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { redirectToSignInAfterLogout } from "@/lib/auth/portalNav";
import type { Plan } from "@/lib/admin/types";
import { listPackages } from "@/lib/coair/commerce";

const PlansPage = () => {
    const router = useRouter();
    const { session, signOut } = useAuth();
    const { plans, companies } = useAdminData();
    const [livePlans, setLivePlans] = useState<Plan[]>([]);
    const live = session?.source === "live";
    const company = companies.find((entry) => entry.id === session?.companyId);
    const catalog = live ? livePlans : plans;
    const selectable = catalog.filter((plan) => plan.id !== "custom");

    useEffect(() => {
        if (!live || !session?.accessToken) return;
        void listPackages(session.accessToken).then(setLivePlans);
    }, [live, session?.accessToken]);

    return (
        <div className="min-h-screen bg-weak-50 px-6 py-10">
            <div className="mx-auto max-w-5xl">
                <div className="mb-8 flex items-center justify-between">
                    <Image
                        className="h-8 w-auto rounded-xl object-contain opacity-100"
                        src="/images/coair-logo.png"
                        width={120}
                        height={32}
                        alt="COAir"
                    />
                    <button
                        type="button"
                        className="text-label-sm text-sub-600 hover:text-strong-950"
                        onClick={async () => {
                            await signOut();
                            redirectToSignInAfterLogout(router);
                        }}
                    >
                        Sign out
                    </button>
                </div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-soft-400">
                    Welcome{session?.name ? ` · ${session.name}` : ""}
                </p>
                <h1 className="mt-2 text-h3 text-strong-950">
                    Choose a COAir package
                </h1>
                <p className="mt-2 max-w-2xl text-label-sm text-sub-600">
                    Super Admin approved {company?.name ?? session?.companyName ?? "your company"}.
                    Select a package, then complete dummy payment. Stripe comes
                    later.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {selectable.map((plan) => (
                        <button
                            key={plan.id}
                            type="button"
                            onClick={() =>
                                router.push(`/onboarding/checkout?plan=${plan.id}`)
                            }
                            className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 text-left transition hover:-translate-y-0.5 hover:border-stroke-sub-300 hover:shadow-lg"
                        >
                            <div className="flex items-baseline justify-between gap-3">
                                <h2 className="text-label-lg text-strong-950">
                                    {plan.name}
                                </h2>
                                <span className="text-label-sm text-blue-500">
                                    {plan.priceLabel}
                                </span>
                            </div>
                            <ul className="mt-4 space-y-1.5 text-label-sm text-sub-600">
                                <li>{plan.usersIncluded} users included</li>
                                <li>{plan.storageLimitGb} GB workspace</li>
                                <li>
                                    {plan.queryCap.toLocaleString()} queries /
                                    tokens
                                </li>
                                <li>${plan.apiCreditsUsd} API credits</li>
                            </ul>
                            <div className="mt-5 text-label-sm text-blue-500">
                                Continue to payment →
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PlansPage;

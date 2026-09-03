"use client";

import { useMemo, useState } from "react";
import AccessRequestsPanel from "@/components/Admin/AccessRequestsPanel";
import PageHeader from "@/components/Admin/PageHeader";
import { useAdminData } from "@/context/AdminDataContext";
import { pendingAccessRequests } from "@/lib/admin/accessRequests";

const OnboardingPage = () => {
    const {
        accessRequests,
        approveCompanyAccessRequest,
        denyCompanyAccessRequest,
        companies,
    } = useAdminData();
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const pending = useMemo(
        () => pendingAccessRequests(accessRequests),
        [accessRequests]
    );
    const awaitingCheckout = useMemo(
        () => companies.filter((company) => company.needsCheckout),
        [companies]
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Onboarding"
                description="Review public access requests before they become tenants. Approved owners sign in and choose a package."
            />
            <AccessRequestsPanel
                pending={pending}
                error={error}
                message={message}
                onApprove={(requestId) => {
                    const request = pending.find((item) => item.id === requestId);
                    const result = approveCompanyAccessRequest(requestId);
                    if (!result.ok) {
                        setError(result.error ?? "Unable to approve");
                        setMessage(null);
                        return;
                    }
                    setError(null);
                    setMessage(
                        `Approved ${request?.companyName ?? "company"} — ${request?.email ?? "the owner"} can sign in and choose a package`
                    );
                }}
                onDeny={(requestId) => {
                    const request = pending.find((item) => item.id === requestId);
                    const result = denyCompanyAccessRequest(requestId);
                    if (!result.ok) {
                        setError(result.error ?? "Unable to deny");
                        setMessage(null);
                        return;
                    }
                    setError(null);
                    setMessage(`Denied ${request?.companyName ?? "request"}`);
                }}
            />
            {awaitingCheckout.length > 0 ? (
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="border-b border-stroke-soft-200 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Waiting for package
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Approved companies that have not finished Stripe
                            checkout yet.
                        </p>
                    </div>
                    <ul className="divide-y divide-stroke-soft-200">
                        {awaitingCheckout.map((company) => (
                            <li
                                key={company.id}
                                className="flex items-center justify-between gap-3 px-5 py-4 text-label-sm"
                            >
                                <span className="text-strong-950">
                                    {company.name}
                                </span>
                                <span className="text-sub-600">
                                    Checkout pending
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
};

export default OnboardingPage;

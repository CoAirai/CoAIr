"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AccessRequestsPanel from "@/components/Admin/AccessRequestsPanel";
import PageHeader from "@/components/Admin/PageHeader";
import { pendingAccessRequests } from "@/lib/admin/accessRequests";
import type { AccessRequest } from "@/lib/admin/accessRequests";
import { SEED_ACCESS_REQUESTS } from "@/lib/admin/accessRequestSeed";
import { withPreview } from "@/lib/admin/preview";
import PreviewBanner from "@/components/Admin/PreviewBanner";
import { useAuth } from "@/context/AuthContext";
import {
    apiErrorMessage,
    approveAccessRequest,
    denyAccessRequest,
    listAccessRequests,
} from "@/lib/coair/commerce";

const LiveOnboardingPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [requestsReady, setRequestsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const loadRequests = useCallback(async () => {
        if (!token) return;
        try {
            setRequests(await listAccessRequests(token));
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setRequestsReady(true);
        }
    }, [token]);

    useEffect(() => {
        void loadRequests();
    }, [loadRequests]);

    const pendingLive = useMemo(
        () => pendingAccessRequests(requests),
        [requests]
    );
    const { rows: pending, preview } = withPreview(
        pendingLive,
        pendingAccessRequests(SEED_ACCESS_REQUESTS),
        requestsReady
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Onboarding"
                description="Approve public access requests. The owner then signs in, chooses a package, and pays with Stripe Checkout."
            />
            {preview ? <PreviewBanner /> : null}
            <AccessRequestsPanel
                pending={pending}
                error={error}
                message={message}
                readOnly={preview}
                onApprove={(requestId) => {
                    void (async () => {
                        try {
                            const result = await approveAccessRequest(
                                token,
                                requestId
                            );
                            setMessage(
                                result.owner.invited || !result.owner.temporary_password
                                    ? `Approved ${result.owner.username}. They will get a COAir email with sign-in details.`
                                    : `Approved ${result.owner.username} — temporary password: ${result.owner.temporary_password}`
                            );
                            setError(null);
                            await loadRequests();
                        } catch (err) {
                            setMessage(null);
                            setError(apiErrorMessage(err));
                        }
                    })();
                }}
                onDeny={(requestId) => {
                    void (async () => {
                        try {
                            await denyAccessRequest(token, requestId);
                            setMessage("Request denied");
                            setError(null);
                            await loadRequests();
                        } catch (err) {
                            setMessage(null);
                            setError(apiErrorMessage(err));
                        }
                    })();
                }}
            />
        </div>
    );
};

export default LiveOnboardingPage;

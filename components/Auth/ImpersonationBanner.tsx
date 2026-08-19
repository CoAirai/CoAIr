"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { stopLiveImpersonation } from "@/lib/coair/impersonate";
import { portalNavigate } from "@/lib/auth/portalNav";
import { adminOrigin } from "@/lib/auth/hosts";

const ImpersonationBanner = () => {
    const { session, applySession } = useAuth();
    const router = useRouter();

    if (!session?.impersonator) return null;

    return (
        <div className="mb-3.5 flex shrink-0 items-center justify-between gap-3 rounded-2xl border-b border-stroke-soft-200 bg-away-lighter px-4 py-2 text-label-sm text-strong-950">
            <span>
                Impersonating {session.name} ({session.email}) as{" "}
                {session.impersonator}
            </span>
            <button
                type="button"
                onClick={() => {
                    const href = stopLiveImpersonation(applySession);
                    portalNavigate(router, href || `${adminOrigin()}/admin`);
                }}
                className="text-label-sm text-blue-500"
            >
                Stop
            </button>
        </div>
    );
};

export default ImpersonationBanner;

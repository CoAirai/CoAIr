"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { planForCompany } from "@/lib/admin/plans";
import { companyForSession } from "@/lib/workspace/companyForSession";
import type { ModuleId } from "@/lib/admin/types";
import { getModuleGate, MODULES } from "@/lib/workspace/moduleAccess";
import { ModulePortalSkeleton } from "@/components/Skeleton/portals";
import PortalRouteGate from "@/components/Skeleton/PortalRouteGate";

type Props = {
    moduleId: Exclude<ModuleId, "chatbot">;
};

const ModulePlaceholderPage = ({ moduleId }: Props) => {
    const router = useRouter();
    const { session } = useAuth();
    const { companies, plans, incrementTrialUsage } = useAdminData();
    const meta = MODULES.find((module) => module.id === moduleId)!;

    const company = useMemo(
        () => companyForSession(session, companies),
        [companies, session]
    );
    const plan = planForCompany(company, plans);
    const gate = company && plan ? getModuleGate(plan, company, moduleId) : null;

    useEffect(() => {
        if (!company || !plan || !gate) return;
        if (gate.state === "locked") {
            router.replace(`/workspace?upgrade=${moduleId}`);
        }
    }, [company, plan, gate, moduleId, router]);

    if (!company || !plan || !gate || gate.state === "locked") {
        return <ModulePortalSkeleton />;
    }

    return (
        <PortalRouteGate skeleton={<ModulePortalSkeleton />}>
        <div className="min-h-screen bg-weak-50 px-6 py-10">
            <div className="mx-auto max-w-3xl rounded-2xl border border-stroke-soft-200 bg-white-0 p-6">
                <Link
                    href="/workspace"
                    className="text-label-sm text-blue-500 hover:text-blue-600"
                >
                    Back to modules
                </Link>
                <p className="mt-5 text-label-xs uppercase tracking-wide text-sub-600">
                    Module {meta.number}
                </p>
                <h1 className="mt-1 text-h4 text-strong-950">{meta.title}</h1>
                <p className="mt-2 text-label-sm text-sub-600">
                    {meta.description}
                </p>
                {gate.kind === "trial" ? (
                    <p className="mt-4 rounded-xl bg-weak-50 px-3 py-2 text-label-sm text-sub-600">
                        Trial remaining: {gate.trialRemaining} report
                        {(gate.trialRemaining ?? 0) === 1 ? "" : "s"}
                    </p>
                ) : null}
                <button
                    type="button"
                    className="mt-6 h-11 rounded-xl bg-blue-500 px-5 text-label-sm text-white-0 hover:bg-blue-600"
                    onClick={() => {
                        if (gate.kind === "trial") {
                            incrementTrialUsage(company.id, moduleId);
                        }
                    }}
                >
                    Generate report
                </button>
            </div>
        </div>
        </PortalRouteGate>
    );
};

export default ModulePlaceholderPage;

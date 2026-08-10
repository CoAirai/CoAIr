"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import HomePage from "@/templates/HomePage";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { getPlanById } from "@/lib/admin/plans";
import { getModuleGate } from "@/lib/workspace/moduleAccess";
import { ChatPortalSkeleton } from "@/components/Skeleton/portals";
import PortalRouteGate from "@/components/Skeleton/PortalRouteGate";

const ChatAccessPage = () => {
    const router = useRouter();
    const { session } = useAuth();
    const { companies, plans } = useAdminData();
    const company = companies.find((entry) => entry.id === session?.companyId);
    const plan = company ? getPlanById(company.planId, plans) : null;
    const gate =
        company && plan ? getModuleGate(plan, company, "chatbot") : null;

    useEffect(() => {
        if (!company || !plan) return;
        if (gate?.state === "locked") {
            router.replace("/workspace?upgrade=chatbot");
        }
    }, [company, plan, gate, router]);

    if (!company || !plan || gate?.state !== "open") {
        return <ChatPortalSkeleton />;
    }

    return (
        <PortalRouteGate skeleton={<ChatPortalSkeleton />}>
            <HomePage />
        </PortalRouteGate>
    );
};

export default ChatAccessPage;

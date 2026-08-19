"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import HomePage from "@/templates/HomePage";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { planForCompany } from "@/lib/admin/plans";
import { companyForSession } from "@/lib/workspace/companyForSession";
import { getModuleGate } from "@/lib/workspace/moduleAccess";
import { ChatPortalSkeleton } from "@/components/Skeleton/portals";
import PortalRouteGate from "@/components/Skeleton/PortalRouteGate";

const ChatAccessPage = () => {
    const router = useRouter();
    const { session } = useAuth();
    const { companies, plans } = useAdminData();
    const company = companyForSession(session, companies);
    const plan = planForCompany(company, plans);
    const gate =
        company && plan ? getModuleGate(plan, company, "chatbot") : null;
    const chatOpen = gate?.state === "open" || session?.source === "live";

    useEffect(() => {
        if (!company || !plan) return;
        if (!chatOpen) {
            router.replace("/workspace?upgrade=chatbot");
        }
    }, [company, plan, chatOpen, router]);

    if (!company || !plan || !chatOpen) {
        return <ChatPortalSkeleton />;
    }

    return (
        <PortalRouteGate skeleton={<ChatPortalSkeleton />}>
            <HomePage />
        </PortalRouteGate>
    );
};

export default ChatAccessPage;

"use client";

import { useAuth } from "@/context/AuthContext";
import LiveCompanyDashboardPage from "@/templates/Company/LiveDashboardPage";
import DashboardPage from "@/templates/Company/DashboardPage";

export default function Page() {
    const { session } = useAuth();
    if (session?.source === "live") {
        return <LiveCompanyDashboardPage />;
    }
    return <DashboardPage />;
}

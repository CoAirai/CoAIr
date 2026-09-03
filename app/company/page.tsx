"use client";

import CompanySourceGate from "@/components/Company/CompanySourceGate";
import LiveCompanyDashboardPage from "@/templates/Company/LiveDashboardPage";
import DashboardPage from "@/templates/Company/DashboardPage";

export default function Page() {
    return (
        <CompanySourceGate
            live={<LiveCompanyDashboardPage />}
            mock={<DashboardPage />}
        />
    );
}

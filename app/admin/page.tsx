"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveDashboardPage from "@/templates/Admin/LiveDashboardPage";
import DashboardPage from "@/templates/Admin/DashboardPage";

export default function Page() {
    return (
        <AdminSourceGate
            live={<LiveDashboardPage />}
            mock={<DashboardPage />}
        />
    );
}

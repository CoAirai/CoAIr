"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveReportsPage from "@/templates/Admin/LiveReportsPage";
import ReportsPage from "@/templates/Admin/ReportsPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveReportsPage />} mock={<ReportsPage />} />
    );
}

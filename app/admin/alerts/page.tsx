"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveAlertsPage from "@/templates/Admin/LiveAlertsPage";
import AlertsPage from "@/templates/Admin/AlertsPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveAlertsPage />} mock={<AlertsPage />} />
    );
}

"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveAnalyticsPage from "@/templates/Admin/LiveAnalyticsPage";
import AnalyticsPage from "@/templates/Admin/AnalyticsPage";

export default function Page() {
    return (
        <AdminSourceGate
            live={<LiveAnalyticsPage />}
            mock={<AnalyticsPage />}
        />
    );
}

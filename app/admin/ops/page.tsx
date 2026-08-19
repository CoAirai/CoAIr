"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveOpsPage from "@/templates/Admin/LiveOpsPage";
import OpsPage from "@/templates/Admin/OpsPage";

export default function Page() {
    return <AdminSourceGate live={<LiveOpsPage />} mock={<OpsPage />} />;
}

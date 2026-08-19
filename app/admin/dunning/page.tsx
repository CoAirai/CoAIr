"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveDunningPage from "@/templates/Admin/LiveDunningPage";
import DunningPage from "@/templates/Admin/DunningPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveDunningPage />} mock={<DunningPage />} />
    );
}

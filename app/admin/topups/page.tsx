"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveTopupsPage from "@/templates/Admin/LiveTopupsPage";
import TopupsPage from "@/templates/Admin/TopupsPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveTopupsPage />} mock={<TopupsPage />} />
    );
}

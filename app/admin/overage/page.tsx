"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveOveragePage from "@/templates/Admin/LiveOveragePage";
import OveragePage from "@/templates/Admin/OveragePage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveOveragePage />} mock={<OveragePage />} />
    );
}

"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveBillingPage from "@/templates/Admin/LiveBillingPage";
import BillingPage from "@/templates/Admin/BillingPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveBillingPage />} mock={<BillingPage />} />
    );
}

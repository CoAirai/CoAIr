"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveAuditPage from "@/templates/Admin/LiveAuditPage";
import AuditPage from "@/templates/Admin/AuditPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveAuditPage />} mock={<AuditPage />} />
    );
}

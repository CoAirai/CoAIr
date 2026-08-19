"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveSecurityPage from "@/templates/Admin/LiveSecurityPage";
import SecurityPage from "@/templates/Admin/SecurityPage";

export default function Page() {
    return (
        <AdminSourceGate
            live={<LiveSecurityPage />}
            mock={<SecurityPage />}
        />
    );
}

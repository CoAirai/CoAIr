"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveRolesPage from "@/templates/Admin/LiveRolesPage";
import RolesPage from "@/templates/Admin/RolesPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveRolesPage />} mock={<RolesPage />} />
    );
}

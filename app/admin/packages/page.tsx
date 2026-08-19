"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LivePackagesPage from "@/templates/Admin/LivePackagesPage";
import PackagesPage from "@/templates/Admin/PackagesPage";

export default function Page() {
    return (
        <AdminSourceGate
            live={<LivePackagesPage />}
            mock={<PackagesPage />}
        />
    );
}

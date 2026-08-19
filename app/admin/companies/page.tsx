"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveCompaniesPage from "@/templates/Admin/LiveCompaniesPage";
import CompaniesPage from "@/templates/Admin/CompaniesPage";

export default function Page() {
    return (
        <AdminSourceGate
            live={<LiveCompaniesPage />}
            mock={<CompaniesPage />}
        />
    );
}

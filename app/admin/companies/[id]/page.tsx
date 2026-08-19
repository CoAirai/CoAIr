"use client";

import { useParams } from "next/navigation";
import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveCompanyDetailPage from "@/templates/Admin/LiveCompanyDetailPage";
import CompanyDetailPage from "@/templates/Admin/CompanyDetailPage";

export default function Page() {
    const { id } = useParams<{ id: string }>();
    if (!id) return null;
    return (
        <AdminSourceGate
            live={<LiveCompanyDetailPage id={id} />}
            mock={<CompanyDetailPage id={id} />}
        />
    );
}

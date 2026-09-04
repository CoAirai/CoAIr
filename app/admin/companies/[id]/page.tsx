"use client";

import { useParams } from "next/navigation";
import LiveCompanyDetailPage from "@/templates/Admin/LiveCompanyDetailPage";

export default function Page() {
    const { id } = useParams<{ id: string }>();
    if (!id) return null;
    return <LiveCompanyDetailPage id={id}/>;
}

"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveModelsPage from "@/templates/Admin/LiveModelsPage";
import ModelsPage from "@/templates/Admin/ModelsPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveModelsPage />} mock={<ModelsPage />} />
    );
}

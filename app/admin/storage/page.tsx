"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveStoragePage from "@/templates/Admin/LiveStoragePage";
import StoragePage from "@/templates/Admin/StoragePage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveStoragePage />} mock={<StoragePage />} />
    );
}

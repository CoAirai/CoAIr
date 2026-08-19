"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveTicketsPage from "@/templates/Admin/LiveTicketsPage";
import TicketsPage from "@/templates/Admin/TicketsPage";

export default function Page() {
    return (
        <AdminSourceGate
            live={<LiveTicketsPage />}
            mock={<TicketsPage />}
        />
    );
}

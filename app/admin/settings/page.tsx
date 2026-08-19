"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveSettingsPage from "@/templates/Admin/LiveSettingsPage";
import SettingsPage from "@/templates/Admin/SettingsPage";

export default function Page() {
    return (
        <AdminSourceGate
            live={<LiveSettingsPage />}
            mock={<SettingsPage />}
        />
    );
}

"use client";

import { usePathname } from "next/navigation";
import AdminLayout from "@/components/Admin/AdminLayout";
import RequireAuth from "@/components/Auth/RequireAuth";

export default function Layout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (pathname === "/admin/sign-in") {
        return <>{children}</>;
    }

    return (
        <RequireAuth role="super_admin">
            <AdminLayout>{children}</AdminLayout>
        </RequireAuth>
    );
}

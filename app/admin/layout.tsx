"use client";

"use client";

import { usePathname } from "next/navigation";
import RequireAuth from "@/components/Auth/RequireAuth";
import AdminLayout from "@/components/Admin/AdminLayout";
import { AdminBadgesProvider } from "@/context/AdminBadgesContext";

const PUBLIC_ADMIN_PATHS = new Set(["/admin/sign-in", "/admin/enter-code"]);

export default function Layout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (PUBLIC_ADMIN_PATHS.has(pathname)) {
        return <>{children}</>;
    }

    return (
        <RequireAuth role="super_admin">
            <AdminBadgesProvider>
                <AdminLayout>{children}</AdminLayout>
            </AdminBadgesProvider>
        </RequireAuth>
    );
}

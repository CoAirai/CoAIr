import { Suspense } from "react";
import AdminSignInPage from "@/templates/Admin/AdminSignInPage";

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AdminSignInPage />
        </Suspense>
    );
}

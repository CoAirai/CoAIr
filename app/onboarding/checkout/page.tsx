import { Suspense } from "react";
import CheckoutPage from "@/templates/Onboarding/CheckoutPage";

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-weak-50 text-sub-600">
                    Loading checkout…
                </div>
            }
        >
            <CheckoutPage />
        </Suspense>
    );
}

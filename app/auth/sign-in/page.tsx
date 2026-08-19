import { Suspense } from "react";
import SignInPage from "@/templates/Auth/SignInPage";

export default function Page() {
    return (
        <Suspense>
            <SignInPage />
        </Suspense>
    );
}

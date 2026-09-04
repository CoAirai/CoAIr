import { Suspense } from "react";
import EnterCodePage from "@/templates/Auth/EnterCodePage";

export default function Page() {
    return (
        <Suspense fallback={null}>
            <EnterCodePage portalHint="admin" />
        </Suspense>
    );
}

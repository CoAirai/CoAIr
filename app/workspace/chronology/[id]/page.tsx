"use client";

import { useParams } from "next/navigation";
import ChronologyReportPage from "@/templates/Chronology/ChronologyReportPage";

export default function Page() {
    const params = useParams<{ id: string }>();
    return <ChronologyReportPage reportId={params.id} />;
}

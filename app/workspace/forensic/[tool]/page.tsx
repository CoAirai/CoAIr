"use client";

import { useParams } from "next/navigation";
import ForensicToolPage from "@/templates/Forensic/ForensicToolPage";

export default function Page() {
    const params = useParams<{ tool: string }>();
    return <ForensicToolPage toolId={params.tool} />;
}

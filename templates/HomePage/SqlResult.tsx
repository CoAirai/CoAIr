"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Citation, SqlArtifact } from "@/lib/chat/types";
import { sqlChart, sqlTable } from "@/lib/chat/sqlArtifact";

const SqlResultChart = dynamic(() => import("./SqlResultChart"), { ssr: false });

export default function SqlResult({ artifact, onOpen, children }: {
    artifact: SqlArtifact;
    onOpen: (citation: Citation) => void;
    children: (headers: string[], rows: string[][]) => ReactNode;
}) {
    const table = sqlTable(artifact);
    const chart = sqlChart(artifact);
    return (
        <section aria-label="Query results" className="mt-3 flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-label-xs text-sub-600">
                <span>{artifact.preview_rows.length} of {artifact.row_count} rows shown</span>
                {artifact.source_file_id && artifact.source_file_name ? (
                    <button type="button" className="text-blue-500 underline" onClick={() => onOpen({
                        documentId: artifact.source_file_id,
                        name: artifact.source_file_name, page: 1, excerpt: "",
                    })}>Source: {artifact.source_file_name}</button>
                ) : null}
            </div>
            {table.headers.length ? children(table.headers, table.rows) : null}
            {artifact.preview_rows.length === 0 ? <p className="text-label-sm text-sub-600">No rows match this query.</p> : null}
            {chart ? (
                <div role="img" aria-label={`${chart.type === "line" ? "Line" : "Bar"} chart of ${chart.y.join(", ")} by ${chart.x}`} className="h-72 w-full min-w-0">
                    <SqlResultChart artifact={artifact} chart={chart} />
                </div>
            ) : null}
            {artifact.generated_sql ? <details className="text-label-xs text-sub-600">
                <summary className="cursor-pointer">View SQL</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-weak-50 p-3">{artifact.generated_sql}</pre>
            </details> : null}
        </section>
    );
}

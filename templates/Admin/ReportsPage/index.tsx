"use client";

import { useState } from "react";

import { REPORT_DEFINITIONS } from "@/lib/admin/billingDemoData";
import { buildMockCsv } from "@/lib/admin/billingSelectors";

const MOCK_REPORT_ROWS: Record<string, Record<string, string>[]> = {
    "rep-revenue": [
        { Company: "Acme Builders", Month: "2026-07", RevenueUSD: "4200" },
        { Company: "Delta Engineering", Month: "2026-07", RevenueUSD: "2850" },
        { Company: "Northstar Labs", Month: "2026-07", RevenueUSD: "1975" },
    ],
    "rep-usage": [
        { Company: "Acme Builders", Tokens: "820000", StorageGB: "62" },
        { Company: "Delta Engineering", Tokens: "560000", StorageGB: "41" },
        { Company: "Northstar Labs", Tokens: "430000", StorageGB: "29" },
    ],
    "rep-growth": [
        { Month: "2026-05", Signups: "18", Upgrades: "7" },
        { Month: "2026-06", Signups: "23", Upgrades: "9" },
        { Month: "2026-07", Signups: "29", Upgrades: "12" },
    ],
    "rep-billing": [
        { Company: "Acme Builders", Status: "Paid", AmountUSD: "4200" },
        { Company: "Delta Engineering", Status: "Retrying", AmountUSD: "2850" },
        { Company: "Northstar Labs", Status: "Past due", AmountUSD: "1975" },
    ],
};

const ReportsPage = () => {
    const [mockedPdfId, setMockedPdfId] = useState<string | null>(null);

    const handleCsvDownload = (reportId: string, title: string) => {
        const csv = buildMockCsv(title, MOCK_REPORT_ROWS[reportId] ?? []);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `coair-${reportId}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Reports</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Export operational and billing snapshots for offline review.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {REPORT_DEFINITIONS.map((report) => (
                    <article
                        key={report.id}
                        className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                    >
                        <h2 className="text-label-lg text-strong-950">
                            {report.title}
                        </h2>
                        <p className="mt-2 text-label-sm text-sub-600">
                            {report.description}
                        </p>

                        <div className="mt-5 flex flex-wrap items-center gap-2">
                            {report.formats.includes("csv") && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        handleCsvDownload(report.id, report.title)
                                    }
                                    className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                >
                                    Download CSV
                                </button>
                            )}
                            {report.formats.includes("pdf") && (
                                <button
                                    type="button"
                                    onClick={() => setMockedPdfId(report.id)}
                                    className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50"
                                >
                                    Export PDF
                                </button>
                            )}
                        </div>

                        {mockedPdfId === report.id && (
                            <p
                                className="mt-3 text-label-xs text-sub-600"
                                role="status"
                            >
                                PDF export mocked
                            </p>
                        )}
                    </article>
                ))}
            </div>
        </div>
    );
};

export default ReportsPage;

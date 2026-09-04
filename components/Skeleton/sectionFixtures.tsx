/** Reusable layout mocks for in-page data skeletons (boneyard capture). */

export function TableSectionFixture({
    columns,
    rows = 6,
}: {
    columns: string[];
    rows?: number;
}) {
    return (
        <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left">
                    <thead className="bg-weak-50 text-label-xs text-sub-600">
                        <tr>
                            {columns.map((label) => (
                                <th key={label} className="px-5 py-3 font-medium">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke-soft-200">
                        {Array.from({ length: rows }).map((_, index) => (
                            <tr key={index} className="text-label-sm">
                                {columns.map((label, col) => (
                                    <td
                                        key={`${label}-${col}`}
                                        className="px-5 py-4 text-strong-950"
                                    >
                                        {col === 0
                                            ? `Row ${index + 1}`
                                            : col === 1
                                              ? `item-${index + 1}`
                                              : "—"}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export function StatCardsFixture({ count = 4 }: { count?: number }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: count }).map((_, index) => (
                <section
                    key={index}
                    className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                >
                    <p className="text-label-sm text-sub-600">Metric {index + 1}</p>
                    <p className="mt-3 text-title-h5 text-strong-950">1,280</p>
                    <p className="mt-1 text-paragraph-sm text-sub-600">Hint</p>
                </section>
            ))}
        </div>
    );
}

export function ChartPanelsFixture({ count = 2 }: { count?: number }) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: count }).map((_, index) => (
                <section
                    key={index}
                    className="rounded-3xl border border-stroke-soft-200 bg-white-0 p-6"
                >
                    <h2 className="text-label-lg text-strong-950">
                        Chart {index + 1}
                    </h2>
                    <p className="mt-2 text-paragraph-sm text-sub-600">
                        Trend over the last period.
                    </p>
                    <div className="mt-6 h-48 rounded-2xl bg-weak-50" />
                </section>
            ))}
        </div>
    );
}

export function CardListFixture({
    title = "Items",
    count = 4,
}: {
    title?: string;
    count?: number;
}) {
    return (
        <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
            <h2 className="text-label-lg text-strong-950">{title}</h2>
            <ul className="mt-4 space-y-3">
                {Array.from({ length: count }).map((_, index) => (
                    <li
                        key={index}
                        className="rounded-xl bg-weak-50 px-4 py-4 text-paragraph-sm text-strong-950"
                    >
                        Item {index + 1} description and status
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function DetailPageFixture() {
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-paragraph-xs text-sub-600">Company</p>
                    <h1 className="text-title-h5 text-strong-950">Acme Builders</h1>
                </div>
                <div className="rounded-xl bg-white-0 px-4 py-2 text-label-sm">
                    Active
                </div>
            </div>
            <StatCardsFixture count={3} />
            <TableSectionFixture
                columns={["Member", "Role", "Tokens", "Status", "Actions"]}
                rows={5}
            />
            <CardListFixture title="Recent activity" count={4} />
        </div>
    );
}

export function DashboardSectionFixture() {
    return (
        <div className="space-y-4">
            <StatCardsFixture count={4} />
            <ChartPanelsFixture count={2} />
            <TableSectionFixture
                columns={["Name", "Plan", "Used", "Limit", "Status"]}
                rows={5}
            />
            <CardListFixture title="Recent activity" count={5} />
        </div>
    );
}

export function AnalyticsSectionFixture() {
    return (
        <div className="space-y-4">
            <StatCardsFixture count={4} />
            <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                    <section
                        key={index}
                        className="rounded-3xl border border-stroke-soft-200 bg-white-0 p-6"
                    >
                        <h2 className="text-label-lg text-strong-950">
                            Panel {index + 1}
                        </h2>
                        <div className="mt-6 h-44 rounded-2xl bg-weak-50" />
                    </section>
                ))}
            </div>
        </div>
    );
}

export function PackagesCardsFixture() {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {["Starter", "Professional", "Enterprise"].map((name) => (
                <section
                    key={name}
                    className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                >
                    <h2 className="text-label-lg text-strong-950">{name}</h2>
                    <p className="mt-2 text-paragraph-sm text-sub-600">
                        Plan details and seat limits.
                    </p>
                    <p className="mt-4 text-title-h5 text-strong-950">$299</p>
                    <div className="mt-6 h-10 rounded-xl bg-weak-50" />
                </section>
            ))}
        </div>
    );
}

export function CheckoutFixture() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-weak-50 px-6">
            <section className="w-full max-w-lg rounded-2xl border border-stroke-soft-200 bg-white-0 p-8">
                <p className="text-paragraph-xs uppercase tracking-wide text-sub-600">
                    Checkout
                </p>
                <h1 className="mt-2 text-title-h5 text-strong-950">
                    Confirm your plan
                </h1>
                <p className="mt-3 text-paragraph-sm text-sub-600">
                    Review seats, billing cycle, and payment method.
                </p>
                <div className="mt-6 space-y-3">
                    <div className="h-14 rounded-xl bg-weak-50" />
                    <div className="h-14 rounded-xl bg-weak-50" />
                    <div className="h-12 rounded-xl bg-strong-950" />
                </div>
            </section>
        </div>
    );
}

export function ReportFixture() {
    return (
        <div className="min-h-screen bg-weak-50 px-6 py-10">
            <div className="mx-auto max-w-3xl space-y-4">
                <div className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-6">
                    <p className="text-paragraph-xs text-sub-600">Chronology</p>
                    <h1 className="mt-2 text-title-h5 text-strong-950">
                        Delay report
                    </h1>
                    <p className="mt-3 text-paragraph-sm text-sub-600">
                        Narrative summary with citations from project documents.
                    </p>
                </div>
                <div className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-6 space-y-3">
                    <div className="h-4 w-full rounded bg-weak-50" />
                    <div className="h-4 w-11/12 rounded bg-weak-50" />
                    <div className="h-4 w-4/5 rounded bg-weak-50" />
                    <div className="h-32 rounded-xl bg-weak-50" />
                </div>
            </div>
        </div>
    );
}

export function UsagePanelFixture() {
    return (
        <div className="space-y-4">
            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">
                    Company token pool
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Package pool split across active members.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    {["Pool", "Used", "Remaining"].map((label) => (
                        <div key={label}>
                            <p className="text-label-xs text-sub-600">{label}</p>
                            <p className="mt-1 text-label-lg text-strong-950 tabular-nums">
                                12,000
                            </p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 h-3 rounded-full bg-weak-50" />
            </section>
            <StatCardsFixture count={3} />
            <TableSectionFixture
                columns={["Member", "Used", "Share", "Remaining"]}
                rows={4}
            />
        </div>
    );
}

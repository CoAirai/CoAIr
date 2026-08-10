import StatCard from "@/components/Admin/StatCard";

const TOKEN_USAGE = [
    { label: "Mon", value: 1200 },
    { label: "Tue", value: 1800 },
    { label: "Wed", value: 1450 },
    { label: "Thu", value: 2300 },
    { label: "Fri", value: 2050 },
    { label: "Sat", value: 900 },
    { label: "Sun", value: 1350 },
];

const numberFormatter = new Intl.NumberFormat("en-US");
const maxTokenUsage = Math.max(...TOKEN_USAGE.map(({ value }) => value));

const AnalyticsPage = () => (
    <div className="space-y-6">
        <div>
            <h1 className="text-label-xl text-strong-950">Analytics</h1>
            <p className="mt-1 text-label-sm text-sub-600">
                Track mock platform engagement and token usage.
            </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
                label="Total requests"
                value="12,480"
                hint="Across all companies"
            />
            <StatCard
                label="Tokens consumed"
                value="2.1M"
                hint="During the current month"
            />
            <StatCard
                label="Active users"
                value="284"
                hint="Active in the last 30 days"
            />
        </div>

        <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
            <div>
                <h2 className="text-label-lg text-strong-950">Weekly token usage</h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Mock token consumption over the last seven days
                </p>
            </div>

            <div
                className="mt-6 flex h-64 items-end gap-3 sm:gap-5"
                role="img"
                aria-label="Weekly token usage bar chart"
            >
                {TOKEN_USAGE.map(({ label, value }) => (
                    <div
                        key={label}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                    >
                        <span className="text-label-xs text-sub-600">
                            {numberFormatter.format(value)}
                        </span>
                        <div
                            className="w-full max-w-16 rounded-t-lg bg-blue-500"
                            style={{
                                height: `${Math.max((value / maxTokenUsage) * 100, 8)}%`,
                            }}
                            title={`${label}: ${numberFormatter.format(value)} tokens`}
                        />
                        <span className="text-label-xs text-sub-600">{label}</span>
                    </div>
                ))}
            </div>
        </section>
    </div>
);

export default AnalyticsPage;

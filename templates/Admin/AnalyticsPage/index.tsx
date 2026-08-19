import { AdminAreaChart, AdminBarChart } from "@/components/Admin/AdminCharts";
import StatCard from "@/components/Admin/StatCard";
import {
    COMPANY_GROWTH_TREND,
    STORAGE_GROWTH_TREND,
    TOKEN_USAGE_TREND,
} from "@/lib/admin/dashboardSeries";

const AnalyticsPage = () => (
    <div className="space-y-6">
        <div>
            <h1 className="text-label-xl text-strong-950">Analytics</h1>
            <p className="mt-1 text-label-sm text-sub-600">
                Track platform engagement, token usage, and storage growth.
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

        <div className="grid gap-6 xl:grid-cols-2">
            <AdminBarChart
                title="Weekly token usage"
                hint="Mock token consumption over the last seven days"
                data={TOKEN_USAGE_TREND}
            />
            <AdminAreaChart
                title="Storage growth"
                hint="Allocated document storage across tenants"
                data={STORAGE_GROWTH_TREND}
                valueSuffix=" GB"
                fillId="analyticsStorageFill"
            />
        </div>
        <AdminAreaChart
            title="Companies on the platform"
            hint="Cumulative tenant count"
            data={COMPANY_GROWTH_TREND}
            fillId="analyticsCompanyFill"
        />
    </div>
);

export default AnalyticsPage;

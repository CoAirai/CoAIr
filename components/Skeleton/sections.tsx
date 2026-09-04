"use client";

import type { ReactNode } from "react";
import DataSkeleton from "./DataSkeleton";
import {
    AnalyticsSectionFixture,
    CardListFixture,
    CheckoutFixture,
    DashboardSectionFixture,
    DetailPageFixture,
    PackagesCardsFixture,
    ReportFixture,
    StatCardsFixture,
    TableSectionFixture,
    UsagePanelFixture,
} from "./sectionFixtures";

type WrapProps = {
    loading: boolean;
    children: ReactNode;
};

function wrap(
    name: string,
    fixture: ReactNode,
    loading: boolean,
    children: ReactNode,
    className?: string
) {
    return (
        <DataSkeleton
            name={name}
            loading={loading}
            fixture={fixture}
            className={className}
        >
            {children}
        </DataSkeleton>
    );
}

/** Capture-only / loading-only (no children yet). */
export function NamedSectionSkeleton({
    name,
    fixture,
    loading = true,
    className,
}: {
    name: string;
    fixture: ReactNode;
    loading?: boolean;
    className?: string;
}) {
    return (
        <DataSkeleton
            name={name}
            loading={loading}
            fixture={fixture}
            className={className}
        >
            {fixture}
        </DataSkeleton>
    );
}

export function AdminDashboardSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-dashboard",
        <DashboardSectionFixture />,
        loading,
        children
    );
}

export function AdminCompaniesTableSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-companies-table",
        <TableSectionFixture
            columns={[
                "Name",
                "Slug",
                "Plan",
                "Members",
                "Storage",
                "Tokens",
                "Status",
                "Renews",
                "Created",
            ]}
        />,
        loading,
        children
    );
}

export function AdminUsersTableSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-users-table",
        <TableSectionFixture
            columns={[
                "Name",
                "Email",
                "Company",
                "Role",
                "Status",
                "Tokens",
                "Created",
            ]}
        />,
        loading,
        children
    );
}

export function AdminCompanyDetailSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-company-detail",
        <DetailPageFixture />,
        loading,
        children
    );
}

export function AdminAnalyticsSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-analytics",
        <AnalyticsSectionFixture />,
        loading,
        children
    );
}

export function AdminStorageSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-storage",
        <div className="space-y-4">
            <StatCardsFixture count={3} />
            <TableSectionFixture
                columns={["Company", "Used", "Limit", "Files", "Status"]}
            />
        </div>,
        loading,
        children
    );
}

export function AdminAlertsSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-alerts",
        <CardListFixture title="Quota alerts" count={5} />,
        loading,
        children
    );
}

export function AdminTicketsTableSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-tickets-table",
        <TableSectionFixture
            columns={["ID", "Subject", "Company", "Status", "Priority", "Updated"]}
        />,
        loading,
        children
    );
}

export function AdminPackagesSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-packages",
        <PackagesCardsFixture />,
        loading,
        children
    );
}

export function AdminDunningTableSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-dunning-table",
        <TableSectionFixture
            columns={["Company", "Amount", "Status", "Attempts", "Next action"]}
        />,
        loading,
        children
    );
}

export function AdminAuditTableSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-audit-table",
        <TableSectionFixture
            columns={["Time", "Actor", "Action", "Target", "Detail"]}
        />,
        loading,
        children
    );
}

export function AdminTokensTableSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-tokens-table",
        <TableSectionFixture
            columns={["Company", "Pool", "Used", "Remaining", "Members"]}
        />,
        loading,
        children
    );
}

export function AdminTopupsTableSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-topups-table",
        <TableSectionFixture
            columns={["Account", "Balance", "Plan", "Last top-up", "Actions"]}
        />,
        loading,
        children
    );
}

export function AdminModelsSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-models",
        <div className="space-y-4">
            <StatCardsFixture count={3} />
            <TableSectionFixture
                columns={["User", "Model", "Calls", "Tokens", "Spend"]}
            />
        </div>,
        loading,
        children
    );
}

export function AdminOnboardingTableSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-onboarding-table",
        <TableSectionFixture
            columns={["Company", "Contact", "Plan", "Requested", "Actions"]}
        />,
        loading,
        children
    );
}

export function AdminBillingTablesSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "admin-billing-tables",
        <div className="space-y-4">
            <TableSectionFixture
                columns={["Invoice", "Company", "Amount", "Status", "Date"]}
                rows={4}
            />
            <TableSectionFixture
                columns={["Subscription", "Company", "Plan", "Renews", "Status"]}
                rows={4}
            />
        </div>,
        loading,
        children
    );
}

export function CompanyTicketsSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "company-tickets-list",
        <CardListFixture title="Support tickets" count={5} />,
        loading,
        children
    );
}

export function CompanyUsageSkeleton({ loading, children }: WrapProps) {
    return wrap("company-usage", <UsagePanelFixture />, loading, children);
}

export function CompanyDashboardSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "company-dashboard",
        <div className="space-y-4">
            <StatCardsFixture count={3} />
            <CardListFixture title="Workspace summary" count={3} />
        </div>,
        loading,
        children
    );
}

export function ChronologyReportSkeleton({ loading, children }: WrapProps) {
    return wrap(
        "chronology-report",
        <ReportFixture />,
        loading,
        children,
        "min-h-screen"
    );
}

export function OnboardingCheckoutSkeleton({
    loading = true,
}: {
    loading?: boolean;
}) {
    return (
        <NamedSectionSkeleton
            name="onboarding-checkout"
            fixture={<CheckoutFixture />}
            loading={loading}
            className="min-h-screen"
        />
    );
}

/** All named section skeletons for `/dev/bones` capture. */
export const SECTION_SKELETON_CAPTURE = [
    { name: "admin-dashboard", node: <NamedSectionSkeleton name="admin-dashboard" fixture={<DashboardSectionFixture />} loading={false} /> },
    { name: "admin-companies-table", node: <NamedSectionSkeleton name="admin-companies-table" fixture={<TableSectionFixture columns={["Name", "Slug", "Plan", "Members", "Storage", "Tokens", "Status", "Renews", "Created"]} />} loading={false} /> },
    { name: "admin-users-table", node: <NamedSectionSkeleton name="admin-users-table" fixture={<TableSectionFixture columns={["Name", "Email", "Company", "Role", "Status", "Tokens", "Created"]} />} loading={false} /> },
    { name: "admin-company-detail", node: <NamedSectionSkeleton name="admin-company-detail" fixture={<DetailPageFixture />} loading={false} /> },
    { name: "admin-analytics", node: <NamedSectionSkeleton name="admin-analytics" fixture={<AnalyticsSectionFixture />} loading={false} /> },
    { name: "admin-storage", node: <NamedSectionSkeleton name="admin-storage" fixture={<div className="space-y-4"><StatCardsFixture count={3} /><TableSectionFixture columns={["Company", "Used", "Limit", "Files", "Status"]} /></div>} loading={false} /> },
    { name: "admin-alerts", node: <NamedSectionSkeleton name="admin-alerts" fixture={<CardListFixture title="Quota alerts" count={5} />} loading={false} /> },
    { name: "admin-tickets-table", node: <NamedSectionSkeleton name="admin-tickets-table" fixture={<TableSectionFixture columns={["ID", "Subject", "Company", "Status", "Priority", "Updated"]} />} loading={false} /> },
    { name: "admin-packages", node: <NamedSectionSkeleton name="admin-packages" fixture={<PackagesCardsFixture />} loading={false} /> },
    { name: "admin-dunning-table", node: <NamedSectionSkeleton name="admin-dunning-table" fixture={<TableSectionFixture columns={["Company", "Amount", "Status", "Attempts", "Next action"]} />} loading={false} /> },
    { name: "admin-audit-table", node: <NamedSectionSkeleton name="admin-audit-table" fixture={<TableSectionFixture columns={["Time", "Actor", "Action", "Target", "Detail"]} />} loading={false} /> },
    { name: "admin-tokens-table", node: <NamedSectionSkeleton name="admin-tokens-table" fixture={<TableSectionFixture columns={["Company", "Pool", "Used", "Remaining", "Members"]} />} loading={false} /> },
    { name: "admin-topups-table", node: <NamedSectionSkeleton name="admin-topups-table" fixture={<TableSectionFixture columns={["Account", "Balance", "Plan", "Last top-up", "Actions"]} />} loading={false} /> },
    { name: "admin-models", node: <NamedSectionSkeleton name="admin-models" fixture={<div className="space-y-4"><StatCardsFixture count={3} /><TableSectionFixture columns={["User", "Model", "Calls", "Tokens", "Spend"]} /></div>} loading={false} /> },
    { name: "admin-onboarding-table", node: <NamedSectionSkeleton name="admin-onboarding-table" fixture={<TableSectionFixture columns={["Company", "Contact", "Plan", "Requested", "Actions"]} />} loading={false} /> },
    { name: "admin-billing-tables", node: <NamedSectionSkeleton name="admin-billing-tables" fixture={<div className="space-y-4"><TableSectionFixture columns={["Invoice", "Company", "Amount", "Status", "Date"]} rows={4} /><TableSectionFixture columns={["Subscription", "Company", "Plan", "Renews", "Status"]} rows={4} /></div>} loading={false} /> },
    { name: "company-tickets-list", node: <NamedSectionSkeleton name="company-tickets-list" fixture={<CardListFixture title="Support tickets" count={5} />} loading={false} /> },
    { name: "company-usage", node: <NamedSectionSkeleton name="company-usage" fixture={<UsagePanelFixture />} loading={false} /> },
    { name: "company-dashboard", node: <NamedSectionSkeleton name="company-dashboard" fixture={<div className="space-y-4"><StatCardsFixture count={3} /><CardListFixture title="Workspace summary" count={3} /></div>} loading={false} /> },
    { name: "chronology-report", node: <NamedSectionSkeleton name="chronology-report" fixture={<ReportFixture />} loading={false} className="min-h-screen" /> },
    { name: "onboarding-checkout", node: <NamedSectionSkeleton name="onboarding-checkout" fixture={<CheckoutFixture />} loading={false} className="min-h-screen" /> },
] as const;

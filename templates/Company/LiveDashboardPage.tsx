"use client";

import PageEnter from "@/components/Motion/PageEnter";
import PageHeader from "@/components/Admin/PageHeader";
import StatCard from "@/components/Admin/StatCard";
import { CompanyDashboardSkeleton } from "@/components/Skeleton/sections";
import { useAuth } from "@/context/AuthContext";
import { useLiveOrg } from "@/lib/coair/useLiveOrg";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";

const numberFormatter = new Intl.NumberFormat("en-US");

const LiveCompanyDashboardPage = () => {
    const { session } = useAuth();
    const { users, org, me, error, loading } = useLiveOrg();
    const { projects, accountUsage } = useLiveWorkspace();
    const usage = accountUsage ?? me;
    const memberCount = org?.counts?.members ?? users.length;
    const projectCount = org?.counts?.projects ?? projects.length;

    return (
        <PageEnter className="page-stack">
            <PageHeader
                title="Dashboard"
                description={`Live overview for ${session?.companyName || "your company"}.`}
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <CompanyDashboardSkeleton loading={loading && !org}>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Team members"
                        value={numberFormatter.format(memberCount)}
                        hint="From GET /org"
                    />
                    <StatCard
                        label="Projects"
                        value={numberFormatter.format(projectCount)}
                        hint="Company projects"
                    />
                    <StatCard
                        label="Tokens used"
                        value={numberFormatter.format(usage?.used_tokens ?? 0)}
                        hint={`of ${numberFormatter.format(usage?.token_limit ?? 0)}`}
                    />
                    <StatCard
                        label="Tokens remaining"
                        value={numberFormatter.format(
                            Math.max(
                                0,
                                (usage?.token_limit ?? 0) -
                                    (usage?.used_tokens ?? 0)
                            )
                        )}
                        hint="Same pool as token limit"
                    />
                </div>
            </CompanyDashboardSkeleton>
        </PageEnter>
    );
};

export default LiveCompanyDashboardPage;

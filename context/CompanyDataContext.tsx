"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import {
    releasedUnusedTokens,
    sharesSumTo100,
    userAllocation,
    userRemainingInSlice,
} from "@/lib/company/tokenMath";
import { getPlanById } from "@/lib/admin/plans";
import type { Company, ModuleId, Plan, PlanId, TokenEconomics, User, UserRole } from "@/lib/admin/types";
import type { Invoice } from "@/lib/admin/billingTypes";
import type { SupportTicket } from "@/lib/admin/wave2Types";
import type {
    CompanyActivityItem,
    CompanyTicket,
    CompanyTicketPriority,
    CompanyUser,
} from "@/lib/company/types";

type CompanyDataContextValue = {
    company: Company;
    users: CompanyUser[];
    overflowTokens: number;
    invoices: Invoice[];
    tickets: CompanyTicket[];
    activity: CompanyActivityItem[];
    plans: Plan[];
    tokenEconomics: TokenEconomics;

    inviteUser: (input: {
        email: string;
        name?: string;
        role: UserRole;
    }) => { ok: boolean; error?: string };
    resendInvite: (userId: string) => { ok: boolean; error?: string };
    setUserRole: (userId: string, role: UserRole) => void;
    setUserStatus: (userId: string, status: "active" | "suspended") => void;
    saveTokenShares: (
        shares: Record<string, number>
    ) => { ok: boolean; error?: string };
    releaseUnused: (userId: string) => { ok: boolean; error?: string };
    setCanUseOverflow: (userId: string, value: boolean) => void;
    buyExtraTokens: (amount: 1000 | 5000 | 10000) => void;
    buyExtraStorage: (gb: 10 | 50 | 100) => void;
    upgradePlan: (planId: PlanId) => { ok: boolean; error?: string };
    buyAddOn: (moduleId: ModuleId) => { ok: boolean; error?: string };
    createTicket: (input: {
        subject: string;
        priority: CompanyTicketPriority;
        message: string;
    }) => void;
    updateCompanyProfile: (input: { name: string; industry: string }) => void;
    changePassword: (
        current: string,
        next: string
    ) => { ok: boolean; error?: string };
};

const CompanyDataContext = createContext<CompanyDataContextValue | null>(null);

function toCompanyUser(user: User): CompanyUser {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        companyId: user.companyId,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        tokenSharePercent: user.tokenSharePercent ?? 0,
        tokensUsed: user.personalTokensUsed ?? 0,
        canUseOverflow: user.canUseOverflow ?? false,
        unusedReleased: user.unusedReleased ?? false,
    };
}

function toCompanyTicket(ticket: SupportTicket): CompanyTicket {
    return {
        id: ticket.id,
        companyId: ticket.companyId,
        subject: ticket.subject,
        message: ticket.message ?? "",
        priority: ticket.priority,
        status: ticket.status === "resolved" ? "resolved" : "open",
        createdAt: ticket.createdAt,
    };
}

export function CompanyDataProvider({ children }: { children: ReactNode }) {
    const { session } = useAuth();
    const {
        companies,
        users: platformUsers,
        invoices: platformInvoices,
        tickets: platformTickets,
        companyWorkspaces,
        inviteUser: invitePlatformUser,
        resendInvite: resendPlatformInvite,
        setUserRole: setPlatformUserRole,
        setUserStatus: setPlatformUserStatus,
        patchUser,
        patchUsers,
        patchCompany,
        setCompanyOverflow,
        pushCompanyActivity,
        createSupportTicket,
        plans,
        setCompanyAddOn,
        tokenEconomics,
    } = useAdminData();

    const companyId = session?.companyId ?? "";

    const company = useMemo(
        () => companies.find((entry) => entry.id === companyId) ?? null,
        [companies, companyId]
    );

    const users = useMemo(
        () =>
            platformUsers
                .filter((user) => user.companyId === companyId)
                .map(toCompanyUser),
        [platformUsers, companyId]
    );

    const invoices = useMemo(
        () =>
            platformInvoices.filter((invoice) => invoice.companyId === companyId),
        [platformInvoices, companyId]
    );

    const tickets = useMemo(
        () =>
            platformTickets
                .filter((ticket) => ticket.companyId === companyId)
                .map(toCompanyTicket),
        [platformTickets, companyId]
    );

    const workspace = companyWorkspaces[companyId];
    const overflowTokens = workspace?.overflowTokens ?? 0;
    const activity = workspace?.activity ?? [];

    const inviteUser = useCallback(
        (input: { email: string; name?: string; role: UserRole }) => {
            if (!company) {
                return { ok: false, error: "Company not found" };
            }

            return invitePlatformUser({
                email: input.email,
                name: input.name,
                companyId: company.id,
                role: input.role,
                rebalanceTokenShares: true,
            });
        },
        [company, invitePlatformUser]
    );

    const resendInvite = useCallback(
        (userId: string) => {
            const target = users.find((user) => user.id === userId);
            const result = resendPlatformInvite(userId);
            if (result.ok && target && company) {
                pushCompanyActivity(company.id, `Resent invite to ${target.email}`);
            }
            return result;
        },
        [users, company, resendPlatformInvite, pushCompanyActivity]
    );

    const setUserRole = useCallback(
        (userId: string, role: UserRole) => {
            const target = users.find((user) => user.id === userId);
            if (!target || !company) return;

            setPlatformUserRole(userId, role);
            pushCompanyActivity(
                company.id,
                `Changed role for ${target.email} to ${role}`
            );
        },
        [users, company, setPlatformUserRole, pushCompanyActivity]
    );

    const setUserStatus = useCallback(
        (userId: string, status: "active" | "suspended") => {
            const target = users.find((user) => user.id === userId);
            if (!target || !company) return;

            setPlatformUserStatus(userId, status);
            pushCompanyActivity(
                company.id,
                `Set ${target.email} status to ${status}`
            );
        },
        [users, company, setPlatformUserStatus, pushCompanyActivity]
    );

    const saveTokenShares = useCallback(
        (shares: Record<string, number>) => {
            if (!company) {
                return { ok: false, error: "Company not found" };
            }

            const values = users.map(
                (user) => shares[user.id] ?? user.tokenSharePercent
            );
            if (values.some((value) => value < 0)) {
                return { ok: false, error: "Share percentages cannot be negative" };
            }
            if (!sharesSumTo100(values)) {
                return { ok: false, error: "Shares must sum to 100%" };
            }

            patchUsers(
                users.map((user) => ({
                    id: user.id,
                    patch: {
                        tokenSharePercent: shares[user.id] ?? user.tokenSharePercent,
                        unusedReleased: false,
                    },
                }))
            );
            setCompanyOverflow(company.id, 0);
            pushCompanyActivity(company.id, "Updated token shares");

            return { ok: true };
        },
        [company, users, patchUsers, setCompanyOverflow, pushCompanyActivity]
    );

    const releaseUnused = useCallback(
        (userId: string) => {
            if (!company) {
                return { ok: false, error: "Company not found" };
            }

            const target = users.find((user) => user.id === userId);
            if (!target) {
                return { ok: false, error: "User not found" };
            }

            const allocation = userAllocation(
                company.tokenLimit,
                target.tokenSharePercent
            );
            const remaining = userRemainingInSlice(
                allocation,
                target.tokensUsed,
                target.unusedReleased
            );
            if (target.unusedReleased || remaining <= 0) {
                return { ok: false, error: "No unused tokens to release" };
            }

            const released = releasedUnusedTokens(allocation, target.tokensUsed);
            patchUser(userId, { unusedReleased: true });
            setCompanyOverflow(company.id, overflowTokens + released);
            pushCompanyActivity(
                company.id,
                `Released ${released.toLocaleString()} unused tokens from ${target.email}`
            );

            return { ok: true };
        },
        [
            company,
            users,
            overflowTokens,
            patchUser,
            setCompanyOverflow,
            pushCompanyActivity,
        ]
    );

    const setCanUseOverflow = useCallback(
        (userId: string, value: boolean) => {
            const target = users.find((user) => user.id === userId);
            if (!target || !company) return;

            patchUser(userId, { canUseOverflow: value });
            pushCompanyActivity(
                company.id,
                `${value ? "Enabled" : "Disabled"} overflow access for ${target.email}`
            );
        },
        [users, company, patchUser, pushCompanyActivity]
    );

    const buyExtraTokens = useCallback(
        (amount: 1000 | 5000 | 10000) => {
            if (!company) return;

            patchCompany(company.id, {
                tokenLimit: company.tokenLimit + amount,
            });
            pushCompanyActivity(
                company.id,
                `Purchased ${amount.toLocaleString()} extra tokens`
            );
        },
        [company, patchCompany, pushCompanyActivity]
    );

    const buyExtraStorage = useCallback(
        (gb: 10 | 50 | 100) => {
            if (!company) return;

            patchCompany(company.id, {
                storageLimitGb: company.storageLimitGb + gb,
            });
            pushCompanyActivity(company.id, `Purchased ${gb} GB extra storage`);
        },
        [company, patchCompany, pushCompanyActivity]
    );

    const upgradePlan = useCallback(
        (planId: PlanId) => {
            if (!company) {
                return { ok: false, error: "Company not found" };
            }

            const plan = getPlanById(planId, plans);
            if (!plan) {
                return { ok: false, error: "Select a valid plan" };
            }
            if (
                company.tokensUsed > plan.queryCap ||
                company.storageUsedGb > plan.storageLimitGb
            ) {
                return {
                    ok: false,
                    error: "Current usage exceeds the new plan limits",
                };
            }

            patchCompany(company.id, {
                planId,
                tokenLimit: plan.queryCap,
                storageLimitGb: plan.storageLimitGb,
            });
            pushCompanyActivity(company.id, `Upgraded plan to ${plan.name}`);

            return { ok: true };
        },
        [company, plans, patchCompany, pushCompanyActivity]
    );

    const buyAddOn = useCallback(
        (moduleId: ModuleId) => {
            if (!company) {
                return { ok: false, error: "Company not found" };
            }
            if (company.addOns.includes(moduleId)) {
                return { ok: false, error: "Add-on already enabled" };
            }
            setCompanyAddOn(company.id, moduleId, true);
            pushCompanyActivity(company.id, `Purchased ${moduleId} add-on`);
            return { ok: true };
        },
        [company, setCompanyAddOn, pushCompanyActivity]
    );

    const createTicket = useCallback(
        (input: {
            subject: string;
            priority: CompanyTicketPriority;
            message: string;
        }) => {
            if (!company) return;

            createSupportTicket({
                companyId: company.id,
                subject: input.subject.trim(),
                priority: input.priority,
                message: input.message.trim(),
            });
            pushCompanyActivity(
                company.id,
                `Created ticket: ${input.subject.trim()}`
            );
        },
        [company, createSupportTicket, pushCompanyActivity]
    );

    const updateCompanyProfile = useCallback(
        (input: { name: string; industry: string }) => {
            if (!company) return;

            patchCompany(company.id, {
                name: input.name.trim() || company.name,
                industry: input.industry.trim() || company.industry,
            });
            pushCompanyActivity(company.id, "Updated company profile");
        },
        [company, patchCompany, pushCompanyActivity]
    );

    const changePassword = useCallback(
        (current: string, next: string) => {
            if (!company) {
                return { ok: false, error: "Company not found" };
            }
            if (!current.trim()) {
                return { ok: false, error: "Current password required" };
            }
            if (next.length < 8) {
                return {
                    ok: false,
                    error: "New password must be at least 8 characters",
                };
            }

            pushCompanyActivity(company.id, "Password changed");
            return { ok: true };
        },
        [company, pushCompanyActivity]
    );

    const value = useMemo(() => {
        if (!company) return null;

        return {
            company,
            users,
            overflowTokens,
            invoices,
            tickets,
            activity,
            plans,
            tokenEconomics,
            inviteUser,
            resendInvite,
            setUserRole,
            setUserStatus,
            saveTokenShares,
            releaseUnused,
            setCanUseOverflow,
            buyExtraTokens,
            buyExtraStorage,
            upgradePlan,
            buyAddOn,
            createTicket,
            updateCompanyProfile,
            changePassword,
        };
    }, [
        company,
        users,
        overflowTokens,
        invoices,
        tickets,
        activity,
        plans,
        tokenEconomics,
        inviteUser,
        resendInvite,
        setUserRole,
        setUserStatus,
        saveTokenShares,
        releaseUnused,
        setCanUseOverflow,
        buyExtraTokens,
        buyExtraStorage,
        upgradePlan,
        buyAddOn,
        createTicket,
        updateCompanyProfile,
        changePassword,
    ]);

    if (!value) {
        return (
            <div className="flex min-h-screen items-center justify-center text-label-md text-sub-600">
                Company not found
            </div>
        );
    }

    return (
        <CompanyDataContext.Provider value={value}>
            {children}
        </CompanyDataContext.Provider>
    );
}

export function useCompanyData() {
    const ctx = useContext(CompanyDataContext);
    if (!ctx) {
        throw new Error("useCompanyData must be used within CompanyDataProvider");
    }
    return ctx;
}

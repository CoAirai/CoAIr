"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { COMPANIES as SEED_COMPANIES, USERS as SEED_USERS } from "@/lib/admin/demoData";
import { INVOICES as SEED_INVOICES, TOP_UP_REQUESTS as SEED_TOP_UP_REQUESTS } from "@/lib/admin/billingDemoData";
import { clonePlans, getPlanById, PLANS } from "@/lib/admin/plans";
import {
    addCompanyDocument as addCompanyDocumentRecord,
    removeCompanyDocument as removeCompanyDocumentRecord,
    SEED_COMPANY_DOCUMENTS,
    type CompanyDocument,
    type CompanyDocumentKind,
} from "@/lib/admin/companyDocuments";
import { consumeUserTokens as consumeUserTokenRecord } from "@/lib/admin/consumeUserTokens";
import {
    chargeUsdForTokens,
    effectiveSellRate,
    marginForTokens,
} from "@/lib/billing/tokenEconomics";
import { applyCheckout } from "@/lib/billing/checkout";
import { dispatchEmail } from "@/lib/email/dispatch";
import type { ChronologyReport } from "@/lib/chronology/types";
import { SEED_CHRONOLOGY_REPORTS } from "@/lib/chronology/seed";
import type {
    ForensicProgrammeWorkspace,
    ForensicReport,
    ForensicXerFile,
} from "@/lib/forensic/types";
import { SEED_FORENSIC_REPORTS } from "@/lib/forensic/seed";
import {
    SEED_FORENSIC_PROGRAMME_WORKSPACES,
    SEED_FORENSIC_XER_FILES,
} from "@/lib/forensic/intakeSeed";
import { buildProgrammeWorkspace } from "@/lib/forensic/intake";
import {
    approveAccessRequest,
    createAccessRequest,
    denyAccessRequest,
    type AccessRequest,
} from "@/lib/admin/accessRequests";
import { SEED_ACCESS_REQUESTS } from "@/lib/admin/accessRequestSeed";
import { SEED_AUDIT } from "@/lib/admin/auditSeed";
import { USER_TOKEN_STORY } from "@/lib/company/seed";
import { equalizeShares } from "@/lib/company/tokenMath";
import type { CompanyActivityItem } from "@/lib/company/types";
import type { SessionRole } from "@/lib/auth/resolveLogin";
import {
    SEED_ANNOUNCEMENTS,
    SEED_COUPONS,
    SEED_FLAGS,
    SEED_MODELS,
    SEED_SECURITY,
    SEED_TAX,
    SEED_TICKETS,
} from "@/lib/admin/wave2DemoData";
import {
    isValidInviteEmail,
    maskApiKey,
    retryInvoiceStatus,
} from "@/lib/admin/wave2Helpers";
import type { Invoice, InvoiceStatus, TopUpRequest, TopUpStatus } from "@/lib/admin/billingTypes";
import type { RightKey } from "@/lib/admin/rolesStub";
import type {
    AuditEntry,
    Company,
    CompanyStatus,
    ModuleId,
    Plan,
    PlanId,
    TokenEconomics,
    User,
    UserRole,
    UserStatus,
} from "@/lib/admin/types";
import type {
    AiModelConfig,
    AiModelId,
    Announcement,
    AnnouncementStatus,
    ApiKeyRecord,
    Coupon,
    CouponDiscountType,
    FeatureFlag,
    SecuritySettings,
    SupportTicket,
    TaxSettings,
    TicketPriority,
    TicketStatus,
} from "@/lib/admin/wave2Types";

type AdminDataContextValue = {
    companies: Company[];
    users: User[];
    accessRequests: AccessRequest[];
    auditLog: AuditEntry[];
    impersonatingUserId: string | null;
    invoices: Invoice[];
    models: AiModelConfig[];
    security: SecuritySettings;
    apiKeys: ApiKeyRecord[];
    tickets: SupportTicket[];
    flags: FeatureFlag[];
    announcements: Announcement[];
    coupons: Coupon[];
    taxSettings: TaxSettings;
    maintenanceMode: boolean;
    maintenanceMessage: string;
    plans: Plan[];
    companyWorkspaces: Record<string, CompanyWorkspaceState>;
    tokenEconomics: TokenEconomics;
    topUpRequests: TopUpRequest[];

    updateTokenEconomics: (input: {
        providerTokensPerUsd: number;
        sellTokensPerUsd: number;
    }) => { ok: boolean; error?: string };
    setCompanySellRateOverride: (
        companyId: string,
        override?: number
    ) => { ok: boolean; error?: string };
    resolveTopUpRequest: (
        requestId: string,
        status: Exclude<TopUpStatus, "pending">
    ) => { ok: boolean; error?: string };

    createCompany: (input: {
        name: string;
        industry: string;
        planId: PlanId;
        status: CompanyStatus;
        ownerEmail: string;
        ownerName?: string;
        ownerStatus?: UserStatus;
        needsCheckout?: boolean;
    }) => { ok: boolean; error?: string };
    requestCompanyAccess: (input: {
        fullName: string;
        email: string;
        companyName: string;
    }) => { ok: boolean; error?: string };
    approveCompanyAccessRequest: (requestId: string) => {
        ok: boolean;
        error?: string;
    };
    completeCompanyCheckout: (
        companyId: string,
        planId: PlanId
    ) => { ok: boolean; error?: string };
    denyCompanyAccessRequest: (requestId: string) => {
        ok: boolean;
        error?: string;
    };
    setCompanyStatus: (companyId: string, status: CompanyStatus) => void;
    updateCompanyPlan: (companyId: string, planId: PlanId) => void;
    updatePlan: (planId: PlanId, patch: Partial<Omit<Plan, "id">>) => void;
    setCompanyAddOn: (
        companyId: string,
        moduleId: ModuleId,
        enabled: boolean
    ) => void;
    incrementTrialUsage: (companyId: string, moduleId: ModuleId) => void;
    addChronologyReport: (report: ChronologyReport) => void;
    addForensicReport: (report: ForensicReport) => void;
    addForensicXerFile: (input: {
        companyId: string;
        name: string;
        sizeMb: number;
    }) => void;
    createForensicProgrammeWorkspace: (input: {
        companyId: string;
        ownerUserId?: string;
        name: string;
        programmeIds: string[];
    }) => { ok: boolean; error?: string; workspaceId?: string };
    setActiveForensicWorkspace: (
        companyId: string,
        workspaceId: string | null
    ) => void;
    setUserStatus: (userId: string, status: UserStatus) => void;
    consumeUserTokens: (
        userId: string,
        amount: number
    ) => { ok: boolean; error?: string };
    addCompanyDocument: (input: {
        companyId: string;
        name: string;
        kind: CompanyDocumentKind;
        addedByUserId: string;
    }) => { ok: boolean; error?: string };
    removeCompanyDocument: (input: {
        companyId: string;
        documentId: string;
        actorRole: SessionRole;
    }) => { ok: boolean; error?: string };
    adjustTokens: (
        companyId: string,
        delta: number,
        note: string
    ) => { ok: boolean; error?: string };

    inviteUser: (input: {
        email: string;
        name?: string;
        companyId: string;
        role: UserRole;
        rebalanceTokenShares?: boolean;
    }) => { ok: boolean; error?: string };
    patchCompany: (
        companyId: string,
        patch: Partial<Omit<Company, "id">>
    ) => void;
    patchUser: (userId: string, patch: Partial<Omit<User, "id">>) => void;
    patchUsers: (
        updates: { id: string; patch: Partial<Omit<User, "id">> }[]
    ) => void;
    setCompanyOverflow: (companyId: string, overflowTokens: number) => void;
    pushCompanyActivity: (companyId: string, text: string) => void;
    createSupportTicket: (input: {
        companyId: string;
        subject: string;
        priority: TicketPriority;
        message: string;
    }) => void;
    resendInvite: (userId: string) => { ok: boolean; error?: string };
    setUserRole: (userId: string, role: UserRole) => void;
    setUserRights: (
        userId: string,
        rights: Partial<Record<RightKey, boolean>>
    ) => void;
    impersonateUser: (userId: string) => void;
    stopImpersonation: () => void;
    forceLogoutUser: (userId: string) => void;

    retryInvoice: (invoiceId: string) => void;
    refundInvoice: (invoiceId: string, reason: string) => void;
    createCoupon: (input: {
        code: string;
        discountType: CouponDiscountType;
        discountValue: number;
    }) => { ok: boolean; error?: string };
    toggleCoupon: (couponId: string) => void;
    updateTax: (input: { percent: number; regionLabel: string }) => void;

    updateModel: (
        modelId: AiModelId,
        patch: Partial<Omit<AiModelConfig, "id">>
    ) => void;

    updateMfa: (required: boolean) => void;
    updateSessionTimeout: (minutes: number) => void;
    addIp: (ip: string) => void;
    removeIp: (ip: string) => void;
    createApiKey: (label: string) => { ok: true; fullKey: string };
    revokeApiKey: (keyId: string) => void;
    changeAdminPassword: (
        current: string,
        next: string
    ) => { ok: boolean; error?: string };

    assignTicket: (ticketId: string, assigneeId: string | null) => void;
    resolveTicket: (ticketId: string) => void;
    reopenTicket: (ticketId: string) => void;

    setFlag: (flagId: string, enabled: boolean) => void;
    setMaintenance: (enabled: boolean, message?: string) => void;
    createAnnouncement: (input: { title: string; body: string }) => void;
    publishAnnouncement: (announcementId: string) => void;
    archiveAnnouncement: (announcementId: string) => void;
};

type CompanyWorkspaceState = {
    overflowTokens: number;
    activity: CompanyActivityItem[];
    documents: CompanyDocument[];
    chronologyReports: ChronologyReport[];
    forensicReports: ForensicReport[];
    forensicXerFiles: ForensicXerFile[];
    forensicProgrammeWorkspaces: ForensicProgrammeWorkspace[];
    activeForensicWorkspaceId: string | null;
};

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

function emptyWorkspace(): CompanyWorkspaceState {
    return {
        overflowTokens: 0,
        activity: [],
        documents: [],
        chronologyReports: [],
        forensicReports: [],
        forensicXerFiles: [],
        forensicProgrammeWorkspaces: [],
        activeForensicWorkspaceId: null,
    };
}

function workspaceDocumentsForCompany(companyId: string): CompanyDocument[] {
    return SEED_COMPANY_DOCUMENTS.filter((doc) => doc.companyId === companyId).map(
        (doc) => ({ ...doc })
    );
}

const DEFAULT_MAINTENANCE_MESSAGE =
    "We're performing scheduled maintenance. Some features may be temporarily unavailable.";

const ACCESS_REQUESTS_KEY = "coair.accessRequests";
const TOKEN_ECONOMICS_KEY = "coair.tokenEconomics";

const DEFAULT_TOKEN_ECONOMICS: TokenEconomics = {
    providerTokensPerUsd: 100,
    sellTokensPerUsd: 80,
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
};

function loadTokenEconomics(): TokenEconomics {
    if (typeof window === "undefined") {
        return { ...DEFAULT_TOKEN_ECONOMICS };
    }
    try {
        const raw = sessionStorage.getItem(TOKEN_ECONOMICS_KEY);
        if (!raw) {
            return { ...DEFAULT_TOKEN_ECONOMICS };
        }
        const parsed = JSON.parse(raw) as TokenEconomics;
        if (
            parsed &&
            parsed.providerTokensPerUsd > 0 &&
            parsed.sellTokensPerUsd > 0
        ) {
            return parsed;
        }
        return { ...DEFAULT_TOKEN_ECONOMICS };
    } catch {
        return { ...DEFAULT_TOKEN_ECONOMICS };
    }
}

function loadAccessRequests(): AccessRequest[] {
    if (typeof window === "undefined") {
        return SEED_ACCESS_REQUESTS.map((request) => ({ ...request }));
    }
    try {
        const raw = sessionStorage.getItem(ACCESS_REQUESTS_KEY);
        if (!raw) {
            return SEED_ACCESS_REQUESTS.map((request) => ({ ...request }));
        }
        const parsed = JSON.parse(raw) as AccessRequest[];
        return Array.isArray(parsed)
            ? parsed.map((request) => ({ ...request }))
            : SEED_ACCESS_REQUESTS.map((request) => ({ ...request }));
    } catch {
        return SEED_ACCESS_REQUESTS.map((request) => ({ ...request }));
    }
}

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function makeApiKeySecret() {
    const bytes = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join("");
    return `sk-live-${bytes}`;
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
    const [companies, setCompanies] = useState<Company[]>(() =>
        SEED_COMPANIES.map((c) => ({
            ...c,
            addOns: [...c.addOns],
            trialUsage: { ...c.trialUsage },
        }))
    );
    const [plans, setPlans] = useState<Plan[]>(() => clonePlans(PLANS));
    const [users, setUsers] = useState<User[]>(() =>
        SEED_USERS.map((u) => {
            const story = USER_TOKEN_STORY[u.id];
            return {
                ...u,
                tokenSharePercent: story?.tokenSharePercent ?? 0,
                personalTokensUsed: story?.tokensUsed ?? 0,
                canUseOverflow: story?.canUseOverflow ?? false,
                unusedReleased: story?.unusedReleased ?? false,
            };
        })
    );
    const [companyWorkspaces, setCompanyWorkspaces] = useState<
        Record<string, CompanyWorkspaceState>
    >(() =>
        Object.fromEntries(
            SEED_COMPANIES.map((company) => [
                company.id,
                {
                    overflowTokens: 0,
                    activity: [] as CompanyActivityItem[],
                    documents: workspaceDocumentsForCompany(company.id),
                    chronologyReports: SEED_CHRONOLOGY_REPORTS.filter(
                        (report) => report.companyId === company.id
                    ).map((report) => ({
                        ...report,
                        sections: report.sections.map((section) => ({
                            ...section,
                            citations: [...section.citations],
                        })),
                        sources: [...report.sources],
                    })),
                    forensicReports: SEED_FORENSIC_REPORTS.filter(
                        (report) => report.companyId === company.id
                    ).map((report) => ({
                        ...report,
                        sections: report.sections.map((section) => ({
                            ...section,
                            citations: [...section.citations],
                        })),
                        sources: [...report.sources],
                    })),
                    forensicXerFiles: SEED_FORENSIC_XER_FILES.filter(
                        (file) => file.companyId === company.id
                    ).map((file) => ({ ...file })),
                    forensicProgrammeWorkspaces:
                        SEED_FORENSIC_PROGRAMME_WORKSPACES.filter(
                            (workspace) => workspace.companyId === company.id
                        ).map((workspace) => ({
                            ...workspace,
                            programmeIds: [...workspace.programmeIds],
                        })),
                    activeForensicWorkspaceId:
                        SEED_FORENSIC_PROGRAMME_WORKSPACES.find(
                            (workspace) => workspace.companyId === company.id
                        )?.id ?? null,
                },
            ])
        )
    );
    const [accessRequests, setAccessRequests] = useState<AccessRequest[]>(() =>
        SEED_ACCESS_REQUESTS.map((request) => ({ ...request }))
    );
    const [accessRequestsReady, setAccessRequestsReady] = useState(false);
    const [auditLog, setAuditLog] = useState<AuditEntry[]>(() =>
        SEED_AUDIT.map((entry) => ({ ...entry }))
    );
    const [impersonatingUserId, setImpersonatingUserId] = useState<
        string | null
    >(null);

    const [invoices, setInvoices] = useState<Invoice[]>(() =>
        SEED_INVOICES.map((i) => ({ ...i }))
    );
    const [models, setModels] = useState<AiModelConfig[]>(() =>
        SEED_MODELS.map((m) => ({ ...m }))
    );
    const [security, setSecurity] = useState<SecuritySettings>(() => ({
        ...SEED_SECURITY,
        ipAllowlist: [...SEED_SECURITY.ipAllowlist],
    }));
    const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
    const [tickets, setTickets] = useState<SupportTicket[]>(() =>
        SEED_TICKETS.map((t) => ({ ...t }))
    );
    const [flags, setFlags] = useState<FeatureFlag[]>(() =>
        SEED_FLAGS.map((f) => ({ ...f }))
    );
    const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
        SEED_ANNOUNCEMENTS.map((a) => ({ ...a }))
    );
    const [coupons, setCoupons] = useState<Coupon[]>(() =>
        SEED_COUPONS.map((c) => ({ ...c }))
    );
    const [taxSettings, setTaxSettings] = useState<TaxSettings>(() => ({
        ...SEED_TAX,
    }));
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState(
        DEFAULT_MAINTENANCE_MESSAGE
    );
    const [tokenEconomics, setTokenEconomics] = useState<TokenEconomics>(() => ({
        ...DEFAULT_TOKEN_ECONOMICS,
    }));
    const [tokenEconomicsReady, setTokenEconomicsReady] = useState(false);
    const [topUpRequests, setTopUpRequests] = useState<TopUpRequest[]>(() =>
        SEED_TOP_UP_REQUESTS.map((request) => ({ ...request }))
    );

    useEffect(() => {
        setAccessRequests(loadAccessRequests());
        setAccessRequestsReady(true);
        setTokenEconomics(loadTokenEconomics());
        setTokenEconomicsReady(true);
    }, []);

    useEffect(() => {
        if (!accessRequestsReady) return;
        sessionStorage.setItem(
            ACCESS_REQUESTS_KEY,
            JSON.stringify(accessRequests)
        );
    }, [accessRequests, accessRequestsReady]);

    useEffect(() => {
        if (!tokenEconomicsReady) return;
        sessionStorage.setItem(
            TOKEN_ECONOMICS_KEY,
            JSON.stringify(tokenEconomics)
        );
    }, [tokenEconomics, tokenEconomicsReady]);

    const pushAudit = useCallback(
        (
            entry: Omit<AuditEntry, "id" | "at" | "actor"> & { actor?: string }
        ) => {
            setAuditLog((prev) => [
                {
                    id: makeId("aud"),
                    at: new Date().toISOString(),
                    actor: "Super Admin",
                    ...entry,
                },
                ...prev,
            ]);
        },
        []
    );

    // --- Companies ---------------------------------------------------------

    const createCompany = useCallback(
        (input: {
            name: string;
            industry: string;
            planId: PlanId;
            status: CompanyStatus;
            ownerEmail: string;
            ownerName?: string;
            ownerStatus?: UserStatus;
            needsCheckout?: boolean;
        }) => {
            if (!isValidInviteEmail(input.ownerEmail)) {
                return { ok: false, error: "Owner invite email required" };
            }

            const plan = getPlanById(input.planId, plans);
            if (!plan) {
                return { ok: false, error: "Select a valid plan" };
            }

            const company: Company = {
                id: makeId("co"),
                name: input.name.trim(),
                industry: input.industry.trim() || "General",
                planId: input.planId,
                status: input.status,
                usersCount: 1,
                storageLimitGb: plan.storageLimitGb,
                storageUsedGb: 0,
                tokenLimit: plan.queryCap,
                tokensUsed: 0,
                createdAt: today(),
                addOns: [],
                trialUsage: {},
                needsCheckout: Boolean(input.needsCheckout),
            };

            const ownerEmail = input.ownerEmail.trim();
            const owner: User = {
                id: makeId("usr"),
                name: input.ownerName?.trim() || ownerEmail.split("@")[0],
                email: ownerEmail,
                companyId: company.id,
                role: "admin",
                status: input.ownerStatus ?? "pending",
                lastLoginAt: null,
                createdAt: today(),
                tokenSharePercent: 100,
                personalTokensUsed: 0,
                canUseOverflow: false,
                unusedReleased: false,
            };

            setCompanies((prev) => [company, ...prev]);
            setUsers((prev) => [owner, ...prev]);
            setCompanyWorkspaces((prev) => ({
                ...prev,
                [company.id]: emptyWorkspace(),
            }));

            pushAudit({
                action: "company.create",
                targetType: "company",
                targetId: company.id,
                targetLabel: company.name,
                detail: `Created with ${plan.name} plan (${plan.storageLimitGb} GB / ${plan.queryCap.toLocaleString()} queries)`,
            });
            pushAudit({
                action: "user.invite",
                targetType: "user",
                targetId: owner.id,
                targetLabel: owner.email,
                detail: `Invited as company admin for ${company.name}`,
            });

            void dispatchEmail({
                kind:
                    input.ownerStatus === "active" && input.needsCheckout
                        ? "access_approved"
                        : "owner_invite",
                to: owner.email,
                name: owner.name,
                companyName: company.name,
                role: "admin",
            });

            return { ok: true };
        },
        [plans, pushAudit]
    );

    const requestCompanyAccess = useCallback(
        (input: {
            fullName: string;
            email: string;
            companyName: string;
        }) => {
            const result = createAccessRequest(accessRequests, users, input);
            if (!result.ok) return result;

            setAccessRequests((prev) => [result.request, ...prev]);
            pushAudit({
                actor: result.request.email,
                action: "company.access_request",
                targetType: "company",
                targetId: result.request.id,
                targetLabel: result.request.companyName,
                detail: `${result.request.fullName} requested a company workspace`,
            });
            void dispatchEmail({
                kind: "access_request_received",
                to: result.request.email,
                name: result.request.fullName,
                companyName: result.request.companyName,
            });
            return { ok: true };
        },
        [accessRequests, users, pushAudit]
    );

    const approveCompanyAccessRequest = useCallback(
        (requestId: string) => {
            const result = approveAccessRequest(accessRequests, requestId);
            if (!result.ok) return result;

            const created = createCompany({
                name: result.approval.companyName,
                industry: "General",
                planId: "demo",
                status: "trial",
                ownerEmail: result.approval.email,
                ownerName: result.approval.fullName,
                ownerStatus: "active",
                needsCheckout: true,
            });
            if (!created.ok) {
                return {
                    ok: false,
                    error: created.error ?? "Unable to create company",
                };
            }

            setAccessRequests(result.requests);
            pushAudit({
                action: "company.access_approve",
                targetType: "company",
                targetId: requestId,
                targetLabel: result.approval.companyName,
                detail: `Approved ${result.approval.email} — owner must choose a package`,
            });
            return { ok: true };
        },
        [accessRequests, createCompany, pushAudit]
    );

    const completeCompanyCheckout = useCallback(
        (companyId: string, planId: PlanId) => {
            const company = companies.find((entry) => entry.id === companyId);
            if (!company) {
                return { ok: false, error: "Company not found" };
            }
            const plan = getPlanById(planId, plans);
            if (!plan) {
                return { ok: false, error: "Select a valid plan" };
            }

            const next = applyCheckout(company, plan);
            setCompanies((prev) =>
                prev.map((entry) => (entry.id === companyId ? next : entry))
            );
            pushAudit({
                action: "company.plan_change",
                targetType: "company",
                targetId: companyId,
                targetLabel: company.name,
                detail: `Checkout complete — ${plan.name} (dummy payment)`,
            });
            return { ok: true };
        },
        [companies, plans, pushAudit]
    );

    const denyCompanyAccessRequest = useCallback(
        (requestId: string) => {
            const result = denyAccessRequest(accessRequests, requestId);
            if (!result.ok) return result;

            const target = accessRequests.find(
                (request) => request.id === requestId
            );
            setAccessRequests(result.requests);
            pushAudit({
                action: "company.access_deny",
                targetType: "company",
                targetId: requestId,
                targetLabel: target?.companyName ?? requestId,
                detail: `Denied ${target?.email ?? "access request"}`,
            });
            if (target) {
                void dispatchEmail({
                    kind: "access_denied",
                    to: target.email,
                    name: target.fullName,
                    companyName: target.companyName,
                });
            }
            return { ok: true };
        },
        [accessRequests, pushAudit]
    );

    const setCompanyStatus = useCallback(
        (companyId: string, status: CompanyStatus) => {
            const target = companies.find((c) => c.id === companyId);
            if (!target) return;

            setCompanies((prev) =>
                prev.map((c) =>
                    c.id === companyId ? { ...c, status } : c
                )
            );
            pushAudit({
                action:
                    status === "suspended"
                        ? "company.suspend"
                        : "company.activate",
                targetType: "company",
                targetId: companyId,
                targetLabel: target.name,
                detail: `Status set to ${status}`,
            });
        },
        [companies, pushAudit]
    );

    const updateCompanyPlan = useCallback(
        (companyId: string, planId: PlanId) => {
            const company = companies.find((c) => c.id === companyId);
            if (!company) return;

            const plan = getPlanById(planId, plans);
            if (!plan) return;

            const oldPlan = getPlanById(company.planId, plans);

            setCompanies((prev) =>
                prev.map((c) =>
                    c.id === companyId
                        ? {
                              ...c,
                              planId,
                              storageLimitGb: plan.storageLimitGb,
                              tokenLimit: plan.queryCap,
                              storageUsedGb: Math.min(
                                  c.storageUsedGb,
                                  plan.storageLimitGb
                              ),
                              tokensUsed: Math.min(c.tokensUsed, plan.queryCap),
                          }
                        : c
                )
            );
            pushAudit({
                action: "company.plan_change",
                targetType: "company",
                targetId: companyId,
                targetLabel: company.name,
                detail: `Plan changed from ${oldPlan?.name ?? company.planId} to ${plan.name}`,
            });
        },
        [companies, plans, pushAudit]
    );

    const updatePlan = useCallback(
        (planId: PlanId, patch: Partial<Omit<Plan, "id">>) => {
            setPlans((prev) =>
                prev.map((plan) => {
                    if (plan.id !== planId) return plan;
                    const next = {
                        ...plan,
                        ...patch,
                        modules: patch.modules
                            ? {
                                  chatbot: {
                                      ...plan.modules.chatbot,
                                      ...patch.modules.chatbot,
                                  },
                                  chronology: {
                                      ...plan.modules.chronology,
                                      ...patch.modules.chronology,
                                  },
                                  forensic: {
                                      ...plan.modules.forensic,
                                      ...patch.modules.forensic,
                                  },
                              }
                            : plan.modules,
                    };
                    return next;
                })
            );
            pushAudit({
                action: "package.update",
                targetType: "package",
                targetId: planId,
                targetLabel: planId,
                detail: "Updated package catalog",
            });
        },
        [pushAudit]
    );

    const setCompanyAddOn = useCallback(
        (companyId: string, moduleId: ModuleId, enabled: boolean) => {
            const company = companies.find((entry) => entry.id === companyId);
            if (!company) return;

            setCompanies((prev) =>
                prev.map((entry) => {
                    if (entry.id !== companyId) return entry;
                    const addOns = enabled
                        ? Array.from(new Set([...entry.addOns, moduleId]))
                        : entry.addOns.filter((item) => item !== moduleId);
                    return { ...entry, addOns };
                })
            );
            pushAudit({
                action: "company.addon",
                targetType: "company",
                targetId: companyId,
                targetLabel: company.name,
                detail: `${enabled ? "Enabled" : "Disabled"} ${moduleId} add-on`,
            });
        },
        [companies, pushAudit]
    );

    const incrementTrialUsage = useCallback(
        (companyId: string, moduleId: ModuleId) => {
            setCompanies((prev) =>
                prev.map((entry) =>
                    entry.id === companyId
                        ? {
                              ...entry,
                              trialUsage: {
                                  ...entry.trialUsage,
                                  [moduleId]:
                                      (entry.trialUsage[moduleId] ?? 0) + 1,
                              },
                          }
                        : entry
                )
            );
        },
        []
    );

    const addChronologyReport = useCallback((report: ChronologyReport) => {
        setCompanyWorkspaces((prev) => {
            const current = prev[report.companyId] ?? emptyWorkspace();
            return {
                ...prev,
                [report.companyId]: {
                    ...current,
                    chronologyReports: [report, ...current.chronologyReports],
                },
            };
        });
    }, []);

    const addForensicReport = useCallback((report: ForensicReport) => {
        setCompanyWorkspaces((prev) => {
            const current = prev[report.companyId] ?? emptyWorkspace();
            return {
                ...prev,
                [report.companyId]: {
                    ...current,
                    forensicReports: [report, ...current.forensicReports],
                },
            };
        });
    }, []);

    const addForensicXerFile = useCallback(
        (input: { companyId: string; name: string; sizeMb: number }) => {
            setCompanyWorkspaces((prev) => {
                const current = prev[input.companyId] ?? emptyWorkspace();
                const file: ForensicXerFile = {
                    id: makeId("xer"),
                    companyId: input.companyId,
                    name: input.name,
                    sizeMb: Number(input.sizeMb.toFixed(2)),
                    addedAt: new Date().toISOString(),
                };
                return {
                    ...prev,
                    [input.companyId]: {
                        ...current,
                        forensicXerFiles: [file, ...current.forensicXerFiles],
                    },
                };
            });
        },
        []
    );

    const createForensicProgrammeWorkspace = useCallback(
        (input: {
            companyId: string;
            ownerUserId?: string;
            name: string;
            programmeIds: string[];
        }) => {
            try {
                const workspace = buildProgrammeWorkspace({
                    id: makeId("fw"),
                    companyId: input.companyId,
                    ownerUserId: input.ownerUserId,
                    name: input.name,
                    programmeIds: input.programmeIds,
                    now: new Date(),
                });
                setCompanyWorkspaces((prev) => {
                    const current = prev[input.companyId] ?? emptyWorkspace();
                    return {
                        ...prev,
                        [input.companyId]: {
                            ...current,
                            forensicProgrammeWorkspaces: [
                                workspace,
                                ...current.forensicProgrammeWorkspaces,
                            ],
                            activeForensicWorkspaceId: workspace.id,
                        },
                    };
                });
                return { ok: true as const, workspaceId: workspace.id };
            } catch (error) {
                return {
                    ok: false as const,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Could not create workspace",
                };
            }
        },
        []
    );

    const setActiveForensicWorkspace = useCallback(
        (companyId: string, workspaceId: string | null) => {
            setCompanyWorkspaces((prev) => {
                const current = prev[companyId] ?? emptyWorkspace();
                return {
                    ...prev,
                    [companyId]: {
                        ...current,
                        activeForensicWorkspaceId: workspaceId,
                    },
                };
            });
        },
        []
    );

    const setUserStatus = useCallback(
        (userId: string, status: UserStatus) => {
            const target = users.find((u) => u.id === userId);
            if (!target) return;

            setUsers((prev) =>
                prev.map((u) => (u.id === userId ? { ...u, status } : u))
            );
            pushAudit({
                action:
                    status === "suspended"
                        ? "user.suspend"
                        : "user.activate",
                targetType: "user",
                targetId: userId,
                targetLabel: target.email,
                detail: `Status set to ${status}`,
            });
        },
        [users, pushAudit]
    );

    const adjustTokens = useCallback(
        (companyId: string, delta: number, note: string) => {
            if (!Number.isFinite(delta) || delta === 0) {
                return { ok: false, error: "Enter a non-zero amount" };
            }

            const company = companies.find((c) => c.id === companyId);
            if (!company) {
                return { ok: false, error: "Company not found" };
            }

            const nextUsed = company.tokensUsed - delta;
            if (nextUsed < 0) {
                return {
                    ok: false,
                    error: "Cannot credit more than tokens already used",
                };
            }
            if (nextUsed > company.tokenLimit) {
                return {
                    ok: false,
                    error: "Cannot debit below zero remaining",
                };
            }

            setCompanies((prev) =>
                prev.map((c) =>
                    c.id === companyId ? { ...c, tokensUsed: nextUsed } : c
                )
            );
            pushAudit({
                action: delta > 0 ? "tokens.credit" : "tokens.debit",
                targetType: "company",
                targetId: companyId,
                targetLabel: company.name,
                detail: `${delta > 0 ? "Credited" : "Debited"} ${Math.abs(delta).toLocaleString()} tokens${note ? ` — ${note}` : ""}`,
            });

            return { ok: true };
        },
        [companies, pushAudit]
    );

    const updateTokenEconomics = useCallback(
        (input: { providerTokensPerUsd: number; sellTokensPerUsd: number }) => {
            if (
                !Number.isFinite(input.providerTokensPerUsd) ||
                !Number.isFinite(input.sellTokensPerUsd) ||
                input.providerTokensPerUsd <= 0 ||
                input.sellTokensPerUsd <= 0
            ) {
                return { ok: false, error: "Rates must be greater than zero" };
            }

            const previous = tokenEconomics;
            const next: TokenEconomics = {
                providerTokensPerUsd: input.providerTokensPerUsd,
                sellTokensPerUsd: input.sellTokensPerUsd,
                updatedAt: new Date().toISOString(),
                updatedBy: "Super Admin",
            };
            setTokenEconomics(next);
            pushAudit({
                action: "tokens.rates_update",
                targetType: "company",
                targetId: "platform",
                targetLabel: "Token rates",
                detail: `Provider ${previous.providerTokensPerUsd}→${next.providerTokensPerUsd} tokens/$1; sell ${previous.sellTokensPerUsd}→${next.sellTokensPerUsd} tokens/$1`,
            });
            return { ok: true };
        },
        [tokenEconomics, pushAudit]
    );

    const setCompanySellRateOverride = useCallback(
        (companyId: string, override?: number) => {
            const company = companies.find((entry) => entry.id === companyId);
            if (!company) {
                return { ok: false, error: "Company not found" };
            }
            if (
                override !== undefined &&
                (!Number.isFinite(override) || override <= 0)
            ) {
                return { ok: false, error: "Override must be greater than zero" };
            }

            setCompanies((prev) =>
                prev.map((entry) =>
                    entry.id === companyId
                        ? {
                              ...entry,
                              sellTokensPerUsdOverride:
                                  override && override > 0 ? override : undefined,
                          }
                        : entry
                )
            );
            pushAudit({
                action: "tokens.sell_override",
                targetType: "company",
                targetId: companyId,
                targetLabel: company.name,
                detail: override
                    ? `Sell rate override set to ${override} tokens/$1`
                    : "Sell rate override cleared",
            });
            return { ok: true };
        },
        [companies, pushAudit]
    );

    const resolveTopUpRequest = useCallback(
        (requestId: string, status: Exclude<TopUpStatus, "pending">) => {
            const request = topUpRequests.find((entry) => entry.id === requestId);
            if (!request) {
                return { ok: false, error: "Top-up request not found" };
            }
            if (request.status !== "pending") {
                return { ok: false, error: "Request already resolved" };
            }

            const company = companies.find(
                (entry) => entry.id === request.companyId
            );
            if (!company) {
                return { ok: false, error: "Company not found" };
            }

            const sellRate = effectiveSellRate(
                tokenEconomics,
                company.sellTokensPerUsdOverride
            );
            const pricing = marginForTokens(
                request.tokensRequested,
                tokenEconomics.providerTokensPerUsd,
                sellRate
            );
            const amountUsd = chargeUsdForTokens(
                request.tokensRequested,
                sellRate
            );
            const resolvedAt = new Date().toISOString();

            setTopUpRequests((prev) =>
                prev.map((entry) =>
                    entry.id === requestId
                        ? { ...entry, status, amountUsd, resolvedAt }
                        : entry
                )
            );

            if (status === "approved") {
                setCompanies((prev) =>
                    prev.map((entry) =>
                        entry.id === company.id
                            ? {
                                  ...entry,
                                  tokenLimit:
                                      entry.tokenLimit + request.tokensRequested,
                              }
                            : entry
                    )
                );
            }

            pushAudit({
                action:
                    status === "approved"
                        ? "tokens.topup_approve"
                        : "tokens.topup_deny",
                targetType: "company",
                targetId: company.id,
                targetLabel: company.name,
                detail: `${status === "approved" ? "Approved" : "Denied"} ${request.tokensRequested.toLocaleString()} tokens — charge $${pricing.chargeUsd.toFixed(2)}, cost $${pricing.providerCostUsd.toFixed(2)}, margin $${pricing.marginUsd.toFixed(2)}`,
            });

            return { ok: true };
        },
        [topUpRequests, companies, tokenEconomics, pushAudit]
    );

    const consumeUserTokens = useCallback(
        (userId: string, amount: number) => {
            const user = users.find((entry) => entry.id === userId);
            if (!user) {
                return { ok: false, error: "User not found" };
            }
            const company = companies.find((entry) => entry.id === user.companyId);
            if (!company) {
                return { ok: false, error: "Company not found" };
            }
            const workspace = companyWorkspaces[company.id] ?? emptyWorkspace();
            const result = consumeUserTokenRecord({
                user,
                company,
                overflowTokens: workspace.overflowTokens,
                amount,
            });
            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            setUsers((prev) =>
                prev.map((entry) =>
                    entry.id === userId
                        ? { ...entry, personalTokensUsed: result.personalTokensUsed }
                        : entry
                )
            );
            setCompanies((prev) =>
                prev.map((entry) =>
                    entry.id === company.id
                        ? { ...entry, tokensUsed: result.companyTokensUsed }
                        : entry
                )
            );
            if (result.usedOverflow > 0) {
                setCompanyWorkspaces((prev) => ({
                    ...prev,
                    [company.id]: {
                        overflowTokens: result.overflowTokens,
                        activity: prev[company.id]?.activity ?? [],
                        documents: prev[company.id]?.documents ?? [],
                        chronologyReports:
                            prev[company.id]?.chronologyReports ?? [],
                        forensicReports:
                            prev[company.id]?.forensicReports ?? [],
                        forensicXerFiles:
                            prev[company.id]?.forensicXerFiles ?? [],
                        forensicProgrammeWorkspaces:
                            prev[company.id]?.forensicProgrammeWorkspaces ?? [],
                        activeForensicWorkspaceId:
                            prev[company.id]?.activeForensicWorkspaceId ?? null,
                    },
                }));
            }

            return { ok: true };
        },
        [companies, companyWorkspaces, users]
    );

    const addCompanyDocument = useCallback(
        (input: {
            companyId: string;
            name: string;
            kind: CompanyDocumentKind;
            addedByUserId: string;
        }) => {
            const workspace = companyWorkspaces[input.companyId] ?? emptyWorkspace();
            const result = addCompanyDocumentRecord({
                documents: workspace.documents,
                companyId: input.companyId,
                name: input.name,
                kind: input.kind,
                addedByUserId: input.addedByUserId,
                now: new Date().toISOString(),
                id: makeId("doc"),
            });
            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            setCompanyWorkspaces((prev) => ({
                ...prev,
                [input.companyId]: {
                    overflowTokens: prev[input.companyId]?.overflowTokens ?? 0,
                    activity: prev[input.companyId]?.activity ?? [],
                    documents: result.documents,
                    chronologyReports:
                        prev[input.companyId]?.chronologyReports ?? [],
                    forensicReports:
                        prev[input.companyId]?.forensicReports ?? [],
                    forensicXerFiles:
                        prev[input.companyId]?.forensicXerFiles ?? [],
                    forensicProgrammeWorkspaces:
                        prev[input.companyId]?.forensicProgrammeWorkspaces ?? [],
                    activeForensicWorkspaceId:
                        prev[input.companyId]?.activeForensicWorkspaceId ?? null,
                },
            }));
            return { ok: true };
        },
        [companyWorkspaces]
    );

    const removeCompanyDocument = useCallback(
        (input: {
            companyId: string;
            documentId: string;
            actorRole: SessionRole;
        }) => {
            const workspace = companyWorkspaces[input.companyId] ?? emptyWorkspace();
            const result = removeCompanyDocumentRecord({
                documents: workspace.documents,
                documentId: input.documentId,
                actorRole: input.actorRole,
            });
            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            setCompanyWorkspaces((prev) => ({
                ...prev,
                [input.companyId]: {
                    overflowTokens: prev[input.companyId]?.overflowTokens ?? 0,
                    activity: prev[input.companyId]?.activity ?? [],
                    documents: result.documents,
                    chronologyReports:
                        prev[input.companyId]?.chronologyReports ?? [],
                    forensicReports:
                        prev[input.companyId]?.forensicReports ?? [],
                    forensicXerFiles:
                        prev[input.companyId]?.forensicXerFiles ?? [],
                    forensicProgrammeWorkspaces:
                        prev[input.companyId]?.forensicProgrammeWorkspaces ?? [],
                    activeForensicWorkspaceId:
                        prev[input.companyId]?.activeForensicWorkspaceId ?? null,
                },
            }));
            return { ok: true };
        },
        [companyWorkspaces]
    );

    // --- Users / access -----------------------------------------------------

    const inviteUser = useCallback(
        (input: {
            email: string;
            name?: string;
            companyId: string;
            role: UserRole;
            rebalanceTokenShares?: boolean;
        }) => {
            if (!isValidInviteEmail(input.email)) {
                return { ok: false, error: "Enter a valid email address" };
            }

            const company = companies.find(
                (entry) => entry.id === input.companyId
            );
            if (!company) {
                return { ok: false, error: "Company not found" };
            }
            const plan = getPlanById(company.planId, plans);
            if (plan && company.usersCount >= plan.usersIncluded) {
                return {
                    ok: false,
                    error: `Seat limit reached (${plan.usersIncluded} users on ${plan.name})`,
                };
            }

            const email = input.email.trim();
            const user: User = {
                id: makeId("usr"),
                name: input.name?.trim() || email.split("@")[0],
                email,
                companyId: input.companyId,
                role: input.role,
                status: "pending",
                lastLoginAt: null,
                createdAt: today(),
                tokenSharePercent: 0,
                personalTokensUsed: 0,
                canUseOverflow: false,
                unusedReleased: false,
            };

            setUsers((prev) => {
                const next = [user, ...prev];
                if (!input.rebalanceTokenShares) return next;

                const companyUsers = next.filter(
                    (entry) => entry.companyId === input.companyId
                );
                const shares = equalizeShares(companyUsers.length);
                const shareById = Object.fromEntries(
                    companyUsers.map((entry, index) => [entry.id, shares[index]])
                );

                return next.map((entry) =>
                    entry.companyId === input.companyId
                        ? {
                              ...entry,
                              tokenSharePercent: shareById[entry.id] ?? 0,
                              unusedReleased: false,
                          }
                        : entry
                );
            });
            setCompanies((prev) =>
                prev.map((entry) =>
                    entry.id === input.companyId
                        ? { ...entry, usersCount: entry.usersCount + 1 }
                        : entry
                )
            );
            setCompanyWorkspaces((prev) => ({
                ...prev,
                [input.companyId]: {
                    overflowTokens: input.rebalanceTokenShares
                        ? 0
                        : prev[input.companyId]?.overflowTokens ?? 0,
                    activity: [
                        {
                            id: makeId("act"),
                            text: `Invited ${email} as ${input.role}`,
                            at: new Date().toISOString(),
                        },
                        ...(prev[input.companyId]?.activity ?? []),
                    ],
                    documents: prev[input.companyId]?.documents ?? [],
                    chronologyReports:
                        prev[input.companyId]?.chronologyReports ?? [],
                    forensicReports:
                        prev[input.companyId]?.forensicReports ?? [],
                    forensicXerFiles:
                        prev[input.companyId]?.forensicXerFiles ?? [],
                    forensicProgrammeWorkspaces:
                        prev[input.companyId]?.forensicProgrammeWorkspaces ?? [],
                    activeForensicWorkspaceId:
                        prev[input.companyId]?.activeForensicWorkspaceId ?? null,
                },
            }));
            pushAudit({
                action: "user.invite",
                targetType: "user",
                targetId: user.id,
                targetLabel: user.email,
                detail: `Invited as ${input.role}`,
            });

            void dispatchEmail({
                kind: "team_invite",
                to: user.email,
                name: user.name,
                companyName: company.name,
                role: input.role,
            });

            return { ok: true };
        },
        [companies, plans, pushAudit]
    );

    const patchCompany = useCallback(
        (companyId: string, patch: Partial<Omit<Company, "id">>) => {
            setCompanies((prev) =>
                prev.map((entry) =>
                    entry.id === companyId ? { ...entry, ...patch } : entry
                )
            );
        },
        []
    );

    const patchUser = useCallback(
        (userId: string, patch: Partial<Omit<User, "id">>) => {
            setUsers((prev) =>
                prev.map((entry) =>
                    entry.id === userId ? { ...entry, ...patch } : entry
                )
            );
        },
        []
    );

    const patchUsers = useCallback(
        (updates: { id: string; patch: Partial<Omit<User, "id">> }[]) => {
            const byId = new Map(updates.map((update) => [update.id, update.patch]));
            setUsers((prev) =>
                prev.map((entry) => {
                    const patch = byId.get(entry.id);
                    return patch ? { ...entry, ...patch } : entry;
                })
            );
        },
        []
    );

    const setCompanyOverflow = useCallback(
        (companyId: string, overflowTokens: number) => {
            setCompanyWorkspaces((prev) => ({
                ...prev,
                [companyId]: {
                    overflowTokens,
                    activity: prev[companyId]?.activity ?? [],
                    documents: prev[companyId]?.documents ?? [],
                    chronologyReports: prev[companyId]?.chronologyReports ?? [],
                    forensicReports: prev[companyId]?.forensicReports ?? [],
                    forensicXerFiles: prev[companyId]?.forensicXerFiles ?? [],
                    forensicProgrammeWorkspaces:
                        prev[companyId]?.forensicProgrammeWorkspaces ?? [],
                    activeForensicWorkspaceId:
                        prev[companyId]?.activeForensicWorkspaceId ?? null,
                },
            }));
        },
        []
    );

    const pushCompanyActivity = useCallback(
        (companyId: string, text: string) => {
            setCompanyWorkspaces((prev) => ({
                ...prev,
                [companyId]: {
                    overflowTokens: prev[companyId]?.overflowTokens ?? 0,
                    activity: [
                        {
                            id: makeId("act"),
                            text,
                            at: new Date().toISOString(),
                        },
                        ...(prev[companyId]?.activity ?? []),
                    ],
                    documents: prev[companyId]?.documents ?? [],
                    chronologyReports: prev[companyId]?.chronologyReports ?? [],
                    forensicReports: prev[companyId]?.forensicReports ?? [],
                    forensicXerFiles: prev[companyId]?.forensicXerFiles ?? [],
                    forensicProgrammeWorkspaces:
                        prev[companyId]?.forensicProgrammeWorkspaces ?? [],
                    activeForensicWorkspaceId:
                        prev[companyId]?.activeForensicWorkspaceId ?? null,
                },
            }));
        },
        []
    );

    const createSupportTicket = useCallback(
        (input: {
            companyId: string;
            subject: string;
            priority: TicketPriority;
            message: string;
        }) => {
            const ticket: SupportTicket = {
                id: makeId("tkt"),
                companyId: input.companyId,
                subject: input.subject,
                status: "open",
                priority: input.priority,
                createdAt: today(),
                message: input.message,
            };
            setTickets((prev) => [ticket, ...prev]);
        },
        []
    );

    const resendInvite = useCallback(
        (userId: string) => {
            const target = users.find((u) => u.id === userId);
            if (!target) {
                return { ok: false, error: "User not found" };
            }
            if (target.status !== "pending") {
                return { ok: false, error: "Only pending invites can be resent" };
            }

            pushAudit({
                action: "user.invite",
                targetType: "user",
                targetId: target.id,
                targetLabel: target.email,
                detail: "Resent invite",
            });

            const company = companies.find(
                (entry) => entry.id === target.companyId
            );
            void dispatchEmail({
                kind: "team_invite",
                to: target.email,
                name: target.name,
                companyName: company?.name,
                role: target.role,
                isResend: true,
            });

            return { ok: true };
        },
        [users, companies, pushAudit]
    );

    const setUserRole = useCallback(
        (userId: string, role: UserRole) => {
            const target = users.find((u) => u.id === userId);
            if (!target) return;

            setUsers((prev) =>
                prev.map((u) => (u.id === userId ? { ...u, role } : u))
            );
            pushAudit({
                action: "user.role_change",
                targetType: "user",
                targetId: userId,
                targetLabel: target.email,
                detail: `Role changed from ${target.role} to ${role}`,
            });
        },
        [users, pushAudit]
    );

    const setUserRights = useCallback(
        (userId: string, rights: Partial<Record<RightKey, boolean>>) => {
            const target = users.find((u) => u.id === userId);
            if (!target) return;
            setUsers((prev) =>
                prev.map((entry) =>
                    entry.id === userId
                        ? { ...entry, rights: { ...entry.rights, ...rights } }
                        : entry
                )
            );
            pushAudit({
                action: "user.role_change",
                targetType: "user",
                targetId: userId,
                targetLabel: target.email,
                detail: `Rights updated for ${target.email}`,
            });
        },
        [users, pushAudit]
    );

    const impersonateUser = useCallback(
        (userId: string) => {
            const target = users.find((u) => u.id === userId);

            setImpersonatingUserId(userId);
            if (target) {
                pushAudit({
                    action: "user.impersonate",
                    targetType: "user",
                    targetId: userId,
                    targetLabel: target.email,
                    detail: "Started impersonation session",
                });
            }
        },
        [users, pushAudit]
    );

    const stopImpersonation = useCallback(() => {
        setImpersonatingUserId(null);
    }, []);

    const forceLogoutUser = useCallback(
        (userId: string) => {
            const target = users.find((u) => u.id === userId);
            if (!target) return;

            setUsers((prev) =>
                prev.map((u) =>
                    u.id === userId ? { ...u, lastLoginAt: null } : u
                )
            );
            pushAudit({
                action: "user.force_logout",
                targetType: "user",
                targetId: userId,
                targetLabel: target.email,
                detail: "Forced logout of all sessions",
            });
        },
        [users, pushAudit]
    );

    // --- Billing -------------------------------------------------------------

    const retryInvoice = useCallback(
        (invoiceId: string) => {
            const current = invoices.find((i) => i.id === invoiceId);
            if (!current) return;

            const nextStatus = retryInvoiceStatus(current.status);
            setInvoices((prev) =>
                prev.map((i) =>
                    i.id === invoiceId ? { ...i, status: nextStatus } : i
                )
            );
            pushAudit({
                action: "billing.retry_invoice",
                targetType: "invoice",
                targetId: invoiceId,
                targetLabel: invoiceId,
                detail: `Retried payment — status ${current.status} → ${nextStatus}`,
            });
        },
        [invoices, pushAudit]
    );

    const refundInvoice = useCallback(
        (invoiceId: string, reason: string) => {
            const target = invoices.find((i) => i.id === invoiceId);
            if (!target) return;

            setInvoices((prev) =>
                prev.map((i) =>
                    i.id === invoiceId
                        ? { ...i, status: "refunded" as InvoiceStatus }
                        : i
                )
            );
            pushAudit({
                action: "billing.refund",
                targetType: "invoice",
                targetId: invoiceId,
                targetLabel: invoiceId,
                detail: `Refunded $${target.amountUsd.toLocaleString()} — ${reason}`,
            });
        },
        [invoices, pushAudit]
    );

    const createCoupon = useCallback(
        (input: {
            code: string;
            discountType: CouponDiscountType;
            discountValue: number;
        }) => {
            const code = input.code.trim().toUpperCase();
            if (!code) {
                return { ok: false, error: "Coupon code required" };
            }
            if (!Number.isFinite(input.discountValue) || input.discountValue <= 0) {
                return { ok: false, error: "Enter a valid discount value" };
            }

            const coupon: Coupon = {
                id: makeId("cpn"),
                code,
                discountType: input.discountType,
                discountValue: input.discountValue,
                active: true,
                createdAt: today(),
            };

            setCoupons((prev) => [coupon, ...prev]);
            pushAudit({
                action: "billing.coupon_create",
                targetType: "coupon",
                targetId: coupon.id,
                targetLabel: coupon.code,
                detail: `Created ${input.discountType === "percent" ? `${input.discountValue}%` : `$${input.discountValue}`} discount`,
            });

            return { ok: true };
        },
        [pushAudit]
    );

    const toggleCoupon = useCallback(
        (couponId: string) => {
            const target = coupons.find((c) => c.id === couponId);
            if (!target) return;

            setCoupons((prev) =>
                prev.map((c) =>
                    c.id === couponId ? { ...c, active: !c.active } : c
                )
            );
            pushAudit({
                action: "billing.coupon_toggle",
                targetType: "coupon",
                targetId: couponId,
                targetLabel: target.code,
                detail: `Set to ${target.active ? "inactive" : "active"}`,
            });
        },
        [coupons, pushAudit]
    );

    const updateTax = useCallback(
        (input: { percent: number; regionLabel: string }) => {
            setTaxSettings(input);
            pushAudit({
                action: "billing.tax_update",
                targetType: "admin",
                targetId: "tax-settings",
                targetLabel: input.regionLabel,
                detail: `Tax rate set to ${input.percent}%`,
            });
        },
        [pushAudit]
    );

    // --- AI models -------------------------------------------------------------

    const updateModel = useCallback(
        (modelId: AiModelId, patch: Partial<Omit<AiModelConfig, "id">>) => {
            const target = models.find((m) => m.id === modelId);
            if (!target) return;

            setModels((prev) =>
                prev.map((m) => (m.id === modelId ? { ...m, ...patch } : m))
            );
            pushAudit({
                action: "model.update",
                targetType: "model",
                targetId: modelId,
                targetLabel: target.name,
                detail: `Updated settings: ${Object.keys(patch).join(", ")}`,
            });
        },
        [models, pushAudit]
    );

    // --- Security -------------------------------------------------------------

    const updateMfa = useCallback(
        (required: boolean) => {
            setSecurity((prev) => ({ ...prev, mfaRequired: required }));
            pushAudit({
                action: "security.mfa",
                targetType: "security",
                targetId: "security-settings",
                targetLabel: "MFA policy",
                detail: `MFA requirement set to ${required ? "enabled" : "disabled"}`,
            });
        },
        [pushAudit]
    );

    const updateSessionTimeout = useCallback(
        (minutes: number) => {
            setSecurity((prev) => ({ ...prev, sessionTimeoutMinutes: minutes }));
            pushAudit({
                action: "security.session_timeout",
                targetType: "security",
                targetId: "security-settings",
                targetLabel: "Session timeout",
                detail: `Session timeout set to ${minutes} minutes`,
            });
        },
        [pushAudit]
    );

    const addIp = useCallback(
        (ip: string) => {
            const trimmed = ip.trim();
            if (!trimmed) return;
            if (security.ipAllowlist.includes(trimmed)) return;

            setSecurity((prev) => ({
                ...prev,
                ipAllowlist: [...prev.ipAllowlist, trimmed],
            }));
            pushAudit({
                action: "security.ip_add",
                targetType: "security",
                targetId: "ip-allowlist",
                targetLabel: trimmed,
                detail: `Added ${trimmed} to IP allowlist`,
            });
        },
        [security, pushAudit]
    );

    const removeIp = useCallback(
        (ip: string) => {
            setSecurity((prev) => ({
                ...prev,
                ipAllowlist: prev.ipAllowlist.filter((item) => item !== ip),
            }));
            pushAudit({
                action: "security.ip_remove",
                targetType: "security",
                targetId: "ip-allowlist",
                targetLabel: ip,
                detail: `Removed ${ip} from IP allowlist`,
            });
        },
        [pushAudit]
    );

    const createApiKey = useCallback(
        (label: string) => {
            const fullKey = makeApiKeySecret();
            const record: ApiKeyRecord = {
                id: makeId("key"),
                label: label.trim() || "Untitled key",
                prefix: fullKey.slice(0, 11),
                lastFour: fullKey.slice(-4),
                createdAt: today(),
            };

            setApiKeys((prev) => [record, ...prev]);
            pushAudit({
                action: "security.api_key_create",
                targetType: "api_key",
                targetId: record.id,
                targetLabel: record.label,
                detail: `Created key ${maskApiKey(fullKey)}`,
            });

            return { ok: true as const, fullKey };
        },
        [pushAudit]
    );

    const revokeApiKey = useCallback(
        (keyId: string) => {
            const target = apiKeys.find((k) => k.id === keyId);
            if (!target) return;

            setApiKeys((prev) =>
                prev.map((k) =>
                    k.id === keyId
                        ? { ...k, revokedAt: new Date().toISOString() }
                        : k
                )
            );
            pushAudit({
                action: "security.api_key_revoke",
                targetType: "api_key",
                targetId: keyId,
                targetLabel: target.label,
                detail: "Revoked API key",
            });
        },
        [apiKeys, pushAudit]
    );

    const changeAdminPassword = useCallback(
        (current: string, next: string) => {
            if (!current.trim()) {
                return { ok: false, error: "Current password required" };
            }
            if (next.length < 8) {
                return {
                    ok: false,
                    error: "New password must be at least 8 characters",
                };
            }

            pushAudit({
                action: "admin.password_change",
                targetType: "admin",
                targetId: "super-admin",
                targetLabel: "Super Admin",
                detail: "Password changed",
            });

            return { ok: true };
        },
        [pushAudit]
    );

    // --- Support tickets -------------------------------------------------------------

    const assignTicket = useCallback(
        (ticketId: string, assigneeId: string | null) => {
            const target = tickets.find((t) => t.id === ticketId);
            if (!target) return;

            const nextAssignee = assigneeId?.trim() || undefined;

            setTickets((prev) =>
                prev.map((t) =>
                    t.id === ticketId ? { ...t, assigneeId: nextAssignee } : t
                )
            );
            pushAudit({
                action: "ticket.assign",
                targetType: "ticket",
                targetId: ticketId,
                targetLabel: target.subject,
                detail: nextAssignee
                    ? `Assigned to ${nextAssignee}`
                    : "Unassigned",
            });
        },
        [tickets, pushAudit]
    );

    const resolveTicket = useCallback(
        (ticketId: string) => {
            const target = tickets.find((t) => t.id === ticketId);
            if (!target) return;

            setTickets((prev) =>
                prev.map((t) =>
                    t.id === ticketId
                        ? { ...t, status: "resolved" as TicketStatus }
                        : t
                )
            );
            pushAudit({
                action: "ticket.resolve",
                targetType: "ticket",
                targetId: ticketId,
                targetLabel: target.subject,
                detail: "Marked resolved",
            });
        },
        [tickets, pushAudit]
    );

    const reopenTicket = useCallback(
        (ticketId: string) => {
            const target = tickets.find((t) => t.id === ticketId);
            if (!target) return;

            setTickets((prev) =>
                prev.map((t) =>
                    t.id === ticketId
                        ? { ...t, status: "open" as TicketStatus }
                        : t
                )
            );
            pushAudit({
                action: "ticket.reopen",
                targetType: "ticket",
                targetId: ticketId,
                targetLabel: target.subject,
                detail: "Reopened ticket",
            });
        },
        [tickets, pushAudit]
    );

    // --- Ops -------------------------------------------------------------

    const setFlag = useCallback(
        (flagId: string, enabled: boolean) => {
            const target = flags.find((f) => f.id === flagId);
            if (!target) return;

            setFlags((prev) =>
                prev.map((f) => (f.id === flagId ? { ...f, enabled } : f))
            );
            pushAudit({
                action: "ops.flag",
                targetType: "ops",
                targetId: flagId,
                targetLabel: target.label,
                detail: `Set to ${enabled ? "enabled" : "disabled"}`,
            });
        },
        [flags, pushAudit]
    );

    const setMaintenance = useCallback(
        (enabled: boolean, message?: string) => {
            const modeChanged = enabled !== maintenanceMode;
            setMaintenanceMode(enabled);
            const nextMessage = message ?? maintenanceMessage;
            if (message !== undefined) {
                setMaintenanceMessage(message);
            }
            if (modeChanged) {
                const snippet =
                    nextMessage.length > 80
                        ? `${nextMessage.slice(0, 80)}…`
                        : nextMessage;
                pushAudit({
                    action: "ops.maintenance",
                    targetType: "ops",
                    targetId: "maintenance-mode",
                    targetLabel: "Maintenance mode",
                    detail: enabled
                        ? `Maintenance mode enabled — "${snippet}"`
                        : "Maintenance mode disabled",
                });
            }
        },
        [maintenanceMessage, maintenanceMode, pushAudit]
    );

    const createAnnouncement = useCallback(
        (input: { title: string; body: string }) => {
            const announcement: Announcement = {
                id: makeId("ann"),
                title: input.title.trim(),
                body: input.body.trim(),
                status: "draft",
                createdAt: today(),
            };

            setAnnouncements((prev) => [announcement, ...prev]);
            pushAudit({
                action: "ops.announcement_create",
                targetType: "ops",
                targetId: announcement.id,
                targetLabel: announcement.title,
                detail: "Created announcement draft",
            });
        },
        [pushAudit]
    );

    const publishAnnouncement = useCallback(
        (announcementId: string) => {
            const target = announcements.find((a) => a.id === announcementId);
            if (!target) return;

            setAnnouncements((prev) =>
                prev.map((a) =>
                    a.id === announcementId
                        ? {
                              ...a,
                              status: "published" as AnnouncementStatus,
                              publishedAt: new Date().toISOString(),
                          }
                        : a
                )
            );
            pushAudit({
                action: "ops.announcement_publish",
                targetType: "ops",
                targetId: announcementId,
                targetLabel: target.title,
                detail: "Published announcement",
            });
        },
        [announcements, pushAudit]
    );

    const archiveAnnouncement = useCallback(
        (announcementId: string) => {
            const target = announcements.find((a) => a.id === announcementId);
            if (!target) return;

            setAnnouncements((prev) =>
                prev.map((a) =>
                    a.id === announcementId
                        ? { ...a, status: "archived" as AnnouncementStatus }
                        : a
                )
            );
            pushAudit({
                action: "ops.announcement_archive",
                targetType: "ops",
                targetId: announcementId,
                targetLabel: target.title,
                detail: "Archived announcement",
            });
        },
        [announcements, pushAudit]
    );

    const value = useMemo(
        () => ({
            companies,
            users,
            accessRequests,
            auditLog,
            impersonatingUserId,
            invoices,
            models,
            security,
            apiKeys,
            tickets,
            flags,
            announcements,
            coupons,
            taxSettings,
            maintenanceMode,
            maintenanceMessage,
            plans,
            companyWorkspaces,
            tokenEconomics,
            topUpRequests,

            updateTokenEconomics,
            setCompanySellRateOverride,
            resolveTopUpRequest,
            createCompany,
            requestCompanyAccess,
            approveCompanyAccessRequest,
            completeCompanyCheckout,
            denyCompanyAccessRequest,
            setCompanyStatus,
            updateCompanyPlan,
            updatePlan,
            setCompanyAddOn,
            incrementTrialUsage,
            addChronologyReport,
            addForensicReport,
            addForensicXerFile,
            createForensicProgrammeWorkspace,
            setActiveForensicWorkspace,
            setUserStatus,
            consumeUserTokens,
            addCompanyDocument,
            removeCompanyDocument,
            adjustTokens,

            inviteUser,
            patchCompany,
            patchUser,
            patchUsers,
            setCompanyOverflow,
            pushCompanyActivity,
            createSupportTicket,
            resendInvite,
            setUserRole,
            setUserRights,
            impersonateUser,
            stopImpersonation,
            forceLogoutUser,

            retryInvoice,
            refundInvoice,
            createCoupon,
            toggleCoupon,
            updateTax,

            updateModel,

            updateMfa,
            updateSessionTimeout,
            addIp,
            removeIp,
            createApiKey,
            revokeApiKey,
            changeAdminPassword,

            assignTicket,
            resolveTicket,
            reopenTicket,

            setFlag,
            setMaintenance,
            createAnnouncement,
            publishAnnouncement,
            archiveAnnouncement,
        }),
        [
            companies,
            users,
            accessRequests,
            auditLog,
            impersonatingUserId,
            invoices,
            models,
            security,
            apiKeys,
            tickets,
            flags,
            announcements,
            coupons,
            taxSettings,
            maintenanceMode,
            maintenanceMessage,
            plans,
            companyWorkspaces,
            tokenEconomics,
            topUpRequests,

            updateTokenEconomics,
            setCompanySellRateOverride,
            resolveTopUpRequest,
            createCompany,
            requestCompanyAccess,
            approveCompanyAccessRequest,
            completeCompanyCheckout,
            denyCompanyAccessRequest,
            setCompanyStatus,
            updateCompanyPlan,
            updatePlan,
            setCompanyAddOn,
            incrementTrialUsage,
            addChronologyReport,
            addForensicReport,
            addForensicXerFile,
            createForensicProgrammeWorkspace,
            setActiveForensicWorkspace,
            setUserStatus,
            consumeUserTokens,
            addCompanyDocument,
            removeCompanyDocument,
            adjustTokens,

            inviteUser,
            patchCompany,
            patchUser,
            patchUsers,
            setCompanyOverflow,
            pushCompanyActivity,
            createSupportTicket,
            resendInvite,
            setUserRole,
            setUserRights,
            impersonateUser,
            stopImpersonation,
            forceLogoutUser,

            retryInvoice,
            refundInvoice,
            createCoupon,
            toggleCoupon,
            updateTax,

            updateModel,

            updateMfa,
            updateSessionTimeout,
            addIp,
            removeIp,
            createApiKey,
            revokeApiKey,
            changeAdminPassword,

            assignTicket,
            resolveTicket,
            reopenTicket,

            setFlag,
            setMaintenance,
            createAnnouncement,
            publishAnnouncement,
            archiveAnnouncement,
        ]
    );

    return (
        <AdminDataContext.Provider value={value}>
            {children}
        </AdminDataContext.Provider>
    );
}

export function useAdminData() {
    const ctx = useContext(AdminDataContext);
    if (!ctx) {
        throw new Error("useAdminData must be used within AdminDataProvider");
    }
    return ctx;
}

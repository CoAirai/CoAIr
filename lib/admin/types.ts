import type { RightKey } from "./rolesStub";

export type PlanId = "demo" | "foundation" | "pro" | "enterprise" | "custom";

export type ModuleId = "chatbot" | "chronology" | "forensic";

export type ModuleAccess = "included" | "trial" | "addon";

export type ModuleRule = {
    access: ModuleAccess;
    trialReports?: number;
};

export type CompanyStatus = "active" | "suspended" | "trial";

export type UserStatus = "active" | "suspended" | "pending";

export type UserRole = "admin" | "member" | "viewer";

export type Plan = {
    id: PlanId;
    name: string;
    priceLabel: string;
    usersIncluded: number;
    storageLimitGb: number;
    apiCreditsUsd: number;
    queryCap: number;
    modules: Record<ModuleId, ModuleRule>;
};

export type TokenEconomics = {
    providerTokensPerUsd: number;
    sellTokensPerUsd: number;
    updatedAt: string;
    updatedBy: string;
};

export type Company = {
    id: string;
    name: string;
    industry: string;
    planId: PlanId;
    status: CompanyStatus;
    usersCount: number;
    storageLimitGb: number;
    storageUsedGb: number;
    tokenLimit: number;
    tokensUsed: number;
    createdAt: string;
    addOns: ModuleId[];
    trialUsage: Partial<Record<ModuleId, number>>;
    needsCheckout?: boolean;
    sellTokensPerUsdOverride?: number;
};

export type User = {
    id: string;
    name: string;
    email: string;
    companyId: string;
    role: UserRole;
    status: UserStatus;
    lastLoginAt: string | null;
    createdAt: string;
    tokenSharePercent?: number;
    personalTokensUsed?: number;
    canUseOverflow?: boolean;
    unusedReleased?: boolean;
    rights?: Partial<Record<RightKey, boolean>>;
};

export type ActivityItem = {
    id: string;
    text: string;
    at: string;
};

export type CompanyFilters = {
    search?: string;
    planId?: PlanId | "all";
    status?: CompanyStatus | "all";
};

export type UserFilters = {
    search?: string;
    companyId?: string | "all";
    status?: UserStatus | "all";
};

export type PlatformTotals = {
    companyCount: number;
    userCount: number;
    storageUsedGb: number;
    storageLimitGb: number;
    tokensUsed: number;
    tokenLimit: number;
};

export type AuditAction =
    | "company.create"
    | "company.access_request"
    | "company.access_approve"
    | "company.access_deny"
    | "company.suspend"
    | "company.activate"
    | "company.plan_change"
    | "company.addon"
    | "user.suspend"
    | "user.activate"
    | "user.invite"
    | "user.role_change"
    | "user.impersonate"
    | "user.force_logout"
    | "tokens.credit"
    | "tokens.debit"
    | "tokens.rates_update"
    | "tokens.sell_override"
    | "tokens.topup_approve"
    | "tokens.topup_deny"
    | "billing.retry_invoice"
    | "billing.refund"
    | "billing.coupon_create"
    | "billing.coupon_toggle"
    | "billing.tax_update"
    | "model.update"
    | "security.mfa"
    | "security.session_timeout"
    | "security.ip_add"
    | "security.ip_remove"
    | "security.api_key_create"
    | "security.api_key_revoke"
    | "admin.password_change"
    | "ticket.assign"
    | "ticket.resolve"
    | "ticket.reopen"
    | "ops.flag"
    | "ops.maintenance"
    | "ops.announcement_create"
    | "ops.announcement_publish"
    | "ops.announcement_archive"
    | "package.update";

export type AuditEntry = {
    id: string;
    at: string;
    actor: string;
    action: AuditAction;
    targetType:
        | "company"
        | "user"
        | "invoice"
        | "coupon"
        | "model"
        | "security"
        | "api_key"
        | "ticket"
        | "ops"
        | "admin"
        | "package";
    targetId: string;
    targetLabel: string;
    detail: string;
};

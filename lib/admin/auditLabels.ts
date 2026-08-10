import type { AuditAction, AuditEntry } from "@/lib/admin/types";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
    "company.create": "Company created",
    "company.access_request": "Access requested",
    "company.access_approve": "Access request approved",
    "company.access_deny": "Access request denied",
    "company.suspend": "Company suspended",
    "company.activate": "Company activated",
    "company.plan_change": "Company plan changed",
    "company.addon": "Company add-on updated",
    "package.update": "Package updated",
    "user.suspend": "User suspended",
    "user.activate": "User activated",
    "user.invite": "User invited",
    "user.role_change": "User role changed",
    "user.impersonate": "User impersonated",
    "user.force_logout": "User force logged out",
    "tokens.credit": "Tokens credited",
    "tokens.debit": "Tokens debited",
    "tokens.rates_update": "Token rates updated",
    "tokens.sell_override": "Sell rate override updated",
    "tokens.topup_approve": "Top-up approved",
    "tokens.topup_deny": "Top-up denied",
    "billing.retry_invoice": "Invoice retried",
    "billing.refund": "Invoice refunded",
    "billing.coupon_create": "Coupon created",
    "billing.coupon_toggle": "Coupon toggled",
    "billing.tax_update": "Tax settings updated",
    "model.update": "AI model updated",
    "security.mfa": "MFA policy updated",
    "security.session_timeout": "Session timeout updated",
    "security.ip_add": "IP allowlist entry added",
    "security.ip_remove": "IP allowlist entry removed",
    "security.api_key_create": "API key created",
    "security.api_key_revoke": "API key revoked",
    "admin.password_change": "Admin password changed",
    "ticket.assign": "Ticket assigned",
    "ticket.resolve": "Ticket resolved",
    "ticket.reopen": "Ticket reopened",
    "ops.flag": "Feature flag updated",
    "ops.maintenance": "Maintenance mode updated",
    "ops.announcement_create": "Announcement created",
    "ops.announcement_publish": "Announcement published",
    "ops.announcement_archive": "Announcement archived",
};

export function formatAuditHeadline(entry: AuditEntry): string {
    const action = AUDIT_ACTION_LABELS[entry.action] ?? entry.action;
    if (entry.targetLabel) {
        return `${action}: ${entry.targetLabel}`;
    }
    return action;
}

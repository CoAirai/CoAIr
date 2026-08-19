export type AlertKind =
    | "access_request"
    | "topup"
    | "ticket"
    | "past_due";

export type AlertItem = {
    id: string;
    kind: AlertKind;
    title: string;
    href: string;
};

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
    access_request: "Access request",
    topup: "Credit request",
    ticket: "Ticket",
    past_due: "Past due",
};

export function buildAlertFeed(input: {
    pendingAccess: Array<{ id: string; companyName: string }>;
    pendingTopUps: Array<{ id: string; companyName: string }>;
    openTickets: Array<{ id: string; subject: string }>;
    pastDueInvoices: Array<{ id: string; companyName: string }>;
}): AlertItem[] {
    const access = input.pendingAccess.map((item) => ({
        id: `access:${item.id}`,
        kind: "access_request" as const,
        title: `${item.companyName} requested access`,
        href: "/admin/onboarding",
    }));
    const topUps = input.pendingTopUps.map((item) => ({
        id: `topup:${item.id}`,
        kind: "topup" as const,
        title: `${item.companyName} requested extra credits`,
        href: "/admin/topups",
    }));
    const tickets = input.openTickets.map((item) => ({
        id: `ticket:${item.id}`,
        kind: "ticket" as const,
        title: item.subject,
        href: "/admin/tickets",
    }));
    const invoices = input.pastDueInvoices.map((item) => ({
        id: `invoice:${item.id}`,
        kind: "past_due" as const,
        title: `${item.companyName} invoice ${item.id} is past due`,
        href: "/admin/billing",
    }));
    return [...access, ...topUps, ...tickets, ...invoices];
}

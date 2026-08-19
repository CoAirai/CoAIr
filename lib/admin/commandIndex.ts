export type CommandKind = "company" | "user" | "invoice" | "ticket";

export type CommandRecord = {
    id: string;
    kind: CommandKind;
    title: string;
    subtitle: string;
    href: string;
};

export function matchCommandRecords(
    records: CommandRecord[],
    query: string,
    limit = 8
): CommandRecord[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return records
        .filter((record) => {
            const haystack = `${record.title} ${record.subtitle} ${record.id} ${record.kind}`;
            return haystack.toLowerCase().includes(q);
        })
        .slice(0, limit);
}

export const COMMAND_KIND_LABEL: Record<CommandKind, string> = {
    company: "Company",
    user: "User",
    invoice: "Invoice",
    ticket: "Ticket",
};

export function buildCommandIndex(input: {
    companies: Array<{ id: string; name: string; subtitle?: string }>;
    users: Array<{ id: string; name: string; subtitle: string }>;
    invoices: Array<{ id: string; companyName: string; status: string }>;
    tickets: Array<{ id: string; subject: string; companyName: string }>;
}): CommandRecord[] {
    return [
        ...input.companies.map((company) => ({
            id: company.id,
            kind: "company" as const,
            title: company.name,
            subtitle: company.subtitle ?? company.id,
            href: "/admin/companies",
        })),
        ...input.users.map((user) => ({
            id: user.id,
            kind: "user" as const,
            title: user.name,
            subtitle: user.subtitle,
            href: "/admin/users",
        })),
        ...input.invoices.map((invoice) => ({
            id: invoice.id,
            kind: "invoice" as const,
            title: invoice.id,
            subtitle: `${invoice.companyName} · ${invoice.status.replace("_", " ")}`,
            href: "/admin/billing",
        })),
        ...input.tickets.map((ticket) => ({
            id: ticket.id,
            kind: "ticket" as const,
            title: ticket.subject,
            subtitle: ticket.companyName,
            href: "/admin/tickets",
        })),
    ];
}

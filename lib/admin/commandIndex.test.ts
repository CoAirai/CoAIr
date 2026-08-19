import { describe, expect, it } from "vitest";
import {
    buildCommandIndex,
    matchCommandRecords,
    type CommandRecord,
} from "./commandIndex";

const records: CommandRecord[] = [
    {
        id: "co-001",
        kind: "company",
        title: "Acme Builders",
        subtitle: "acme",
        href: "/admin/companies",
    },
    {
        id: "ada",
        kind: "user",
        title: "Ada Lovelace",
        subtitle: "ada@acme.example",
        href: "/admin/users",
    },
    {
        id: "inv-003",
        kind: "invoice",
        title: "inv-003",
        subtitle: "Cedar Construction · past due",
        href: "/admin/billing",
    },
    {
        id: "tkt-001",
        kind: "ticket",
        title: "Token usage spike",
        subtitle: "Cedar Construction",
        href: "/admin/tickets",
    },
];

describe("matchCommandRecords", () => {
    it("returns nothing for a blank query", () => {
        expect(matchCommandRecords(records, "  ")).toEqual([]);
    });

    it("matches companies by name and related user emails", () => {
        expect(matchCommandRecords(records, "acme").map((hit) => hit.id)).toEqual(
            ["co-001", "ada"]
        );
    });

    it("matches invoices by id", () => {
        expect(matchCommandRecords(records, "inv-003")[0]?.kind).toBe("invoice");
    });

    it("caps results", () => {
        expect(matchCommandRecords(records, "a", 2)).toHaveLength(2);
    });
});

describe("buildCommandIndex", () => {
    it("maps companies, users, invoices, and tickets onto existing admin pages", () => {
        const index = buildCommandIndex({
            companies: [{ id: "co-001", name: "Acme", subtitle: "acme" }],
            users: [{ id: "ada", name: "Ada", subtitle: "ada@acme.example" }],
            invoices: [
                { id: "inv-1", companyName: "Acme", status: "past_due" },
            ],
            tickets: [
                { id: "tkt-1", subject: "Upload stuck", companyName: "Acme" },
            ],
        });
        expect(index.map((item) => item.href)).toEqual([
            "/admin/companies",
            "/admin/users",
            "/admin/billing",
            "/admin/tickets",
        ]);
    });
});

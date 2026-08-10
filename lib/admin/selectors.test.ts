import { describe, it, expect } from "vitest";
import {
  getStorageRemaining,
  getTokensRemaining,
  getPlatformTotals,
  filterCompanies,
  filterUsers,
} from "./selectors";
import type { Company, User } from "./types";

const company = (partial: Partial<Company> & Pick<Company, "id" | "name">): Company => ({
  industry: "Construction",
  planId: "foundation",
  status: "active",
  usersCount: 5,
  storageLimitGb: 100,
  storageUsedGb: 40,
  tokenLimit: 10000,
  tokensUsed: 2500,
  createdAt: "2026-01-01",
  addOns: [],
  trialUsage: {},
  ...partial,
});

describe("quota remaining", () => {
  it("computes storage and token remaining", () => {
    const c = company({ id: "1", name: "Acme" });
    expect(getStorageRemaining(c)).toBe(60);
    expect(getTokensRemaining(c)).toBe(7500);
  });

  it("never returns negative remaining", () => {
    const c = company({
      id: "2",
      name: "Over",
      storageUsedGb: 120,
      tokensUsed: 20000,
    });
    expect(getStorageRemaining(c)).toBe(0);
    expect(getTokensRemaining(c)).toBe(0);
  });
});

describe("getPlatformTotals", () => {
  it("sums companies and quotas", () => {
    const totals = getPlatformTotals([
      company({ id: "a", name: "A", usersCount: 3 }),
      company({ id: "b", name: "B", usersCount: 7, storageUsedGb: 10, tokensUsed: 500 }),
    ]);
    expect(totals.companyCount).toBe(2);
    expect(totals.userCount).toBe(10);
    expect(totals.storageUsedGb).toBe(50);
    expect(totals.storageLimitGb).toBe(200);
    expect(totals.tokensUsed).toBe(3000);
    expect(totals.tokenLimit).toBe(20000);
  });
});

describe("filters", () => {
  const companies = [
    company({ id: "1", name: "Acme Builders", planId: "pro", status: "active" }),
    company({ id: "2", name: "Beta Labs", planId: "demo", status: "trial" }),
  ];

  it("filters companies by search, plan, status", () => {
    expect(filterCompanies(companies, { search: "acme" })).toHaveLength(1);
    expect(filterCompanies(companies, { planId: "demo" })).toHaveLength(1);
    expect(filterCompanies(companies, { status: "trial" })).toHaveLength(1);
  });

  it("filters users by search, company, status", () => {
    const users: User[] = [
      {
        id: "u1",
        name: "Ada Lovelace",
        email: "ada@acme.com",
        companyId: "1",
        role: "admin",
        status: "active",
        lastLoginAt: "2026-08-01",
        createdAt: "2026-01-02",
      },
      {
        id: "u2",
        name: "Bob",
        email: "bob@beta.com",
        companyId: "2",
        role: "member",
        status: "pending",
        lastLoginAt: null,
        createdAt: "2026-02-01",
      },
    ];
    expect(filterUsers(users, { search: "ada" })).toHaveLength(1);
    expect(filterUsers(users, { companyId: "2" })).toHaveLength(1);
    expect(filterUsers(users, { status: "pending" })).toHaveLength(1);
  });
});

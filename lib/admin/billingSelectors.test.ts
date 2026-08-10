import { describe, it, expect } from "vitest";
import {
  getBillingStats,
  filterInvoices,
  resolveTopUp,
  acknowledgeAlert,
  extendGrace,
  retryDunning,
  buildMockCsv,
} from "./billingSelectors";
import type {
  Invoice,
  TopUpRequest,
  QuotaAlert,
  DunningCase,
} from "./billingTypes";

const inv = (p: Partial<Invoice> & Pick<Invoice, "id" | "companyId">): Invoice => ({
  amountUsd: 99,
  status: "open",
  issuedAt: "2026-08-01",
  dueAt: "2026-08-15",
  ...p,
});

describe("getBillingStats", () => {
  it("sums outstanding and counts failed", () => {
    const invoices = [
      inv({ id: "i1", companyId: "co-001", amountUsd: 100, status: "open" }),
      inv({ id: "i2", companyId: "co-001", amountUsd: 50, status: "past_due" }),
      inv({ id: "i3", companyId: "co-002", amountUsd: 20, status: "paid" }),
    ];
    const stats = getBillingStats(
      invoices,
      [
        { id: "p1", companyId: "co-001", amountUsd: 10, method: "card", last4: "4242", status: "failed", paidAt: "2026-08-01" },
        { id: "p2", companyId: "co-001", amountUsd: 20, method: "card", last4: "4242", status: "succeeded", paidAt: "2026-08-02" },
      ],
      new Date("2026-08-04")
    );
    expect(stats.outstandingUsd).toBe(150);
    expect(stats.failedPaymentCount).toBe(1);
    expect(stats.paidThisMonthUsd).toBe(20);
  });
});

describe("resolveTopUp", () => {
  it("approves a pending request", () => {
    const list: TopUpRequest[] = [
      {
        id: "t1",
        companyId: "co-001",
        tokensRequested: 5000,
        amountUsd: 49,
        reason: "Campaign",
        status: "pending",
        createdAt: "2026-08-01",
      },
    ];
    const next = resolveTopUp(list, "t1", "approved", "2026-08-04T12:00:00.000Z");
    expect(next[0].status).toBe("approved");
    expect(next[0].resolvedAt).toBe("2026-08-04T12:00:00.000Z");
  });
});

describe("acknowledgeAlert", () => {
  it("marks alert acknowledged", () => {
    const alerts: QuotaAlert[] = [
      {
        id: "a1",
        companyId: "co-003",
        kind: "tokens",
        thresholdPct: 90,
        message: "Tokens at 90%",
        createdAt: "2026-08-01",
        acknowledged: false,
      },
    ];
    expect(acknowledgeAlert(alerts, "a1")[0].acknowledged).toBe(true);
  });
});

describe("dunning helpers", () => {
  it("extends grace by 7 days and retries", () => {
    const cases: DunningCase[] = [
      {
        id: "d1",
        companyId: "co-004",
        status: "grace",
        failedAt: "2026-08-01",
        graceEndsAt: "2026-08-08",
        attemptCount: 1,
      },
    ];
    const extended = extendGrace(cases, "d1", 7);
    expect(extended[0].graceEndsAt).toBe("2026-08-15");
    const retried = retryDunning(cases, "d1");
    expect(retried[0].status).toBe("retrying");
    expect(retried[0].attemptCount).toBe(2);
  });
});

describe("buildMockCsv", () => {
  it("includes header and a row", () => {
    const csv = buildMockCsv("Revenue", [
      { Company: "Acme", Amount: "100" },
    ]);
    expect(csv).toContain("Company,Amount");
    expect(csv).toContain("Acme,100");
  });
});

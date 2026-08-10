import type {
  BillingStats,
  DunningCase,
  Invoice,
  InvoiceFilters,
  Payment,
  PaymentFilters,
  QuotaAlert,
  TopUpRequest,
  TopUpStatus,
} from "./billingTypes";

const MRR_USD = 12450;

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isCurrentMonth(dateStr: string, now: Date): boolean {
  const [year, month] = dateStr.split("-").map(Number);
  return year === now.getFullYear() && month === now.getMonth() + 1;
}

export function getBillingStats(
  invoices: Invoice[],
  payments: Payment[],
  now: Date = new Date()
): BillingStats {
  const outstandingUsd = invoices
    .filter((inv) => inv.status === "open" || inv.status === "past_due")
    .reduce((sum, inv) => sum + inv.amountUsd, 0);

  const failedPaymentCount = payments.filter((p) => p.status === "failed").length;

  const paidThisMonthUsd = payments
    .filter((p) => p.status === "succeeded" && isCurrentMonth(p.paidAt, now))
    .reduce((sum, p) => sum + p.amountUsd, 0);

  return {
    mrrUsd: MRR_USD,
    outstandingUsd,
    paidThisMonthUsd,
    failedPaymentCount,
  };
}

export function filterInvoices(
  invoices: Invoice[],
  filters: InvoiceFilters
): Invoice[] {
  const q = filters.search?.trim().toLowerCase() ?? "";
  return invoices.filter((inv) => {
    if (filters.status && filters.status !== "all" && inv.status !== filters.status)
      return false;
    if (q) {
      const name = filters.companyNameById[inv.companyId] ?? "";
      if (!name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function filterPayments(
  payments: Payment[],
  filters: PaymentFilters
): Payment[] {
  const q = filters.search?.trim().toLowerCase() ?? "";
  return payments.filter((p) => {
    if (filters.status && filters.status !== "all" && p.status !== filters.status)
      return false;
    if (q) {
      const name = filters.companyNameById[p.companyId] ?? "";
      if (!name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function resolveTopUp(
  list: TopUpRequest[],
  id: string,
  status: TopUpStatus,
  resolvedAt: string
): TopUpRequest[] {
  return list.map((item) =>
    item.id === id ? { ...item, status, resolvedAt } : item
  );
}

export function acknowledgeAlert(
  alerts: QuotaAlert[],
  id: string
): QuotaAlert[] {
  return alerts.map((alert) =>
    alert.id === id ? { ...alert, acknowledged: true } : alert
  );
}

export function extendGrace(
  cases: DunningCase[],
  id: string,
  days: number
): DunningCase[] {
  return cases.map((c) =>
    c.id === id
      ? { ...c, graceEndsAt: addDaysToDateString(c.graceEndsAt, days) }
      : c
  );
}

export function retryDunning(
  cases: DunningCase[],
  id: string
): DunningCase[] {
  return cases.map((c) =>
    c.id === id
      ? { ...c, status: "retrying" as const, attemptCount: c.attemptCount + 1 }
      : c
  );
}

export function buildMockCsv(
  _title: string,
  rows: Record<string, string>[]
): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) => headers.map((h) => row[h]).join(","));
  return [headerLine, ...dataLines].join("\n");
}

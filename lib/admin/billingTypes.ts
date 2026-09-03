export type InvoiceStatus = "paid" | "open" | "past_due" | "refunded";

export interface Invoice {
  id: string;
  companyId: string;
  amountUsd: number;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  description?: string;
}

export type PaymentStatus = "succeeded" | "failed" | "pending";

export interface Payment {
  id: string;
  companyId: string;
  invoiceId?: string;
  amountUsd: number;
  method: "card";
  last4: string;
  status: PaymentStatus;
  paidAt: string;
}

export type TopUpStatus = "pending" | "approved" | "denied";

export interface TopUpRequest {
  id: string;
  companyId: string;
  tokensRequested: number;
  amountUsd: number;
  reason: string;
  status: TopUpStatus;
  createdAt: string;
  resolvedAt?: string;
}

export type QuotaAlertKind = "tokens" | "storage";
export type QuotaAlertThreshold = 80 | 90 | 100;

export interface QuotaAlert {
  id: string;
  companyId: string;
  kind: QuotaAlertKind;
  thresholdPct: QuotaAlertThreshold;
  message: string;
  createdAt: string;
  acknowledged: boolean;
}

export type OverageMode = "block" | "throttle" | "bill";

export interface OveragePolicy {
  mode: OverageMode;
  triggerPct: number;
  overageRatePer1kTokensUsd?: number;
  notes?: string;
}

export type DunningStatus = "grace" | "retrying" | "suspended";

export interface DunningCase {
  id: string;
  companyId: string;
  status: DunningStatus;
  failedAt: string;
  graceEndsAt: string;
  attemptCount: number;
}

export type ReportFormat = "csv" | "pdf";

export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  formats: ReportFormat[];
}

export interface BillingStats {
  mrrUsd: number;
  outstandingUsd: number;
  paidThisMonthUsd: number;
  failedPaymentCount: number;
}

export interface InvoiceFilters {
  search?: string;
  status?: InvoiceStatus | "all";
  companyNameById: Record<string, string>;
}

export interface PaymentFilters {
  search?: string;
  status?: PaymentStatus | "all";
  companyNameById: Record<string, string>;
}

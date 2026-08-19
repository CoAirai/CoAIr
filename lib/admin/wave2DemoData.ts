import type {
  AiModelConfig,
  Announcement,
  Coupon,
  FeatureFlag,
  SecuritySettings,
  SupportTicket,
  TaxSettings,
} from "./wave2Types";

export const SEED_MODELS: AiModelConfig[] = [
  {
    id: "chat",
    name: "COAIR-Chat",
    enabled: true,
    requestsPerMinute: 120,
    dailyTokenCap: 500_000,
  },
  {
    id: "embed",
    name: "COAIR-Embed",
    enabled: true,
    requestsPerMinute: 300,
    dailyTokenCap: 1_000_000,
  },
  {
    id: "analyze",
    name: "COAIR-Analyze",
    enabled: true,
    requestsPerMinute: 60,
    dailyTokenCap: 250_000,
  },
];

export const SEED_SECURITY: SecuritySettings = {
  mfaRequired: false,
  sessionTimeoutMinutes: 60,
  ipAllowlist: [],
};

export const SEED_TICKETS: SupportTicket[] = [
  {
    id: "tkt-001",
    companyId: "co-003",
    subject: "Token usage spike on Cedar Construction",
    status: "open",
    priority: "high",
    createdAt: "2026-08-03",
    assigneeId: "Aisha Khan",
  },
  {
    id: "tkt-002",
    companyId: "co-001",
    subject: "Invoice PDF download issue",
    status: "open",
    priority: "medium",
    createdAt: "2026-08-02",
    assigneeId: "Marcus Lee",
  },
  {
    id: "tkt-003",
    companyId: "co-004",
    subject: "Forensic XER upload stuck at 80%",
    status: "open",
    priority: "high",
    createdAt: "2026-08-10",
  },
  {
    id: "tkt-004",
    companyId: "co-002",
    subject: "Need extra storage for trial project",
    status: "open",
    priority: "low",
    createdAt: "2026-08-08",
    assigneeId: "Priya Rao",
  },
  {
    id: "tkt-005",
    companyId: "co-006",
    subject: "SSO login loop after password reset",
    status: "resolved",
    priority: "medium",
    createdAt: "2026-08-01",
    assigneeId: "Aisha Khan",
  },
  {
    id: "tkt-006",
    companyId: "co-005",
    subject: "Chronology report missing annex files",
    status: "resolved",
    priority: "medium",
    createdAt: "2026-07-28",
  },
];

export const SEED_FLAGS: FeatureFlag[] = [
  {
    id: "flag-001",
    key: "embed",
    label: "COAIR-Embed",
    enabled: true,
  },
  {
    id: "flag-002",
    key: "analyze",
    label: "COAIR-Analyze",
    enabled: true,
  },
  {
    id: "flag-003",
    key: "topups",
    label: "Token Top-ups",
    enabled: false,
  },
];

export const SEED_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "ann-001",
    title: "Scheduled maintenance window",
    body: "Platform maintenance is planned for August 10, 02:00–04:00 UTC.",
    status: "draft",
    createdAt: "2026-08-04",
  },
];

export const SEED_COUPONS: Coupon[] = [
  {
    id: "cpn-001",
    code: "WELCOME10",
    discountType: "percent",
    discountValue: 10,
    active: true,
    createdAt: "2026-07-01",
  },
];

export const SEED_TAX: TaxSettings = {
  percent: 5,
  regionLabel: "Default",
};

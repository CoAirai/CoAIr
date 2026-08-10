export type AiModelId = "chat" | "embed" | "analyze";

export type AiModelConfig = {
  id: AiModelId;
  name: string;
  enabled: boolean;
  requestsPerMinute: number;
  dailyTokenCap: number;
};

export type SecuritySettings = {
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  ipAllowlist: string[];
};

export type ApiKeyRecord = {
  id: string;
  label: string;
  prefix: string;
  lastFour: string;
  fullKey?: string;
  createdAt: string;
  revokedAt?: string;
};

export type TicketStatus = "open" | "resolved";
export type TicketPriority = "low" | "medium" | "high";

export type SupportTicket = {
  id: string;
  companyId: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  createdAt: string;
  message?: string;
};

export type FeatureFlag = {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
};

export type AnnouncementStatus = "draft" | "published" | "archived";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  createdAt: string;
  publishedAt?: string;
};

export type CouponDiscountType = "percent" | "fixed";

export type Coupon = {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  active: boolean;
  createdAt: string;
};

export type TaxSettings = {
  percent: number;
  regionLabel: string;
};

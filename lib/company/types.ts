import type { UserRole, UserStatus } from "../admin/types";

export type CompanyUser = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  tokenSharePercent: number;
  tokensUsed: number;
  canUseOverflow: boolean;
  unusedReleased: boolean;
};

export type CompanyActivityItem = {
  id: string;
  text: string;
  at: string;
};

export type CompanyTicketPriority = "low" | "medium" | "high";
export type CompanyTicketStatus = "open" | "resolved";

export type CompanyTicket = {
  id: string;
  companyId: string;
  subject: string;
  message: string;
  priority: CompanyTicketPriority;
  status: CompanyTicketStatus;
  createdAt: string;
};

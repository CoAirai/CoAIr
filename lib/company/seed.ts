import { COMPANIES, USERS } from "../admin/demoData";
import { INVOICES } from "../admin/billingDemoData";
import type { Company } from "../admin/types";
import type { Invoice } from "../admin/billingTypes";
import type { CompanyActivityItem, CompanyTicket, CompanyUser } from "./types";

export type CompanySeed = {
  company: Company;
  users: CompanyUser[];
  overflowTokens: number;
  invoices: Invoice[];
  tickets: CompanyTicket[];
  activity: CompanyActivityItem[];
};

export const USER_TOKEN_STORY: Record<
  string,
  Pick<
    CompanyUser,
    "tokenSharePercent" | "tokensUsed" | "canUseOverflow" | "unusedReleased"
  >
> = {
  "u-001": {
    tokenSharePercent: 25,
    tokensUsed: 400,
    canUseOverflow: false,
    unusedReleased: false,
  },
  "u-002": {
    tokenSharePercent: 25,
    tokensUsed: 400,
    canUseOverflow: false,
    unusedReleased: false,
  },
  "u-003": {
    tokenSharePercent: 25,
    tokensUsed: 400,
    canUseOverflow: false,
    unusedReleased: false,
  },
  "u-004": {
    tokenSharePercent: 25,
    tokensUsed: 80,
    canUseOverflow: false,
    unusedReleased: false,
  },
};

export function createCompanySeed(): CompanySeed {
  const source = COMPANIES.find((c) => c.id === "co-001");
  if (!source) {
    throw new Error("Demo company co-001 not found");
  }

  const company: Company = {
    ...source,
    tokensUsed: 400 + 400 + 400 + 80,
  };

  const users: CompanyUser[] = USERS.filter((u) => u.companyId === "co-001").map(
    (user) => {
      const tokenFields = USER_TOKEN_STORY[user.id];
      if (!tokenFields) {
        throw new Error(`Missing token story for user ${user.id}`);
      }
      return {
        ...user,
        ...tokenFields,
      };
    }
  );

  const invoices = INVOICES.filter((i) => i.companyId === "co-001").map(
    (invoice) => ({ ...invoice })
  );

  return {
    company,
    users,
    overflowTokens: 0,
    invoices,
    tickets: [],
    activity: [],
  };
}

export const COMPANY_SEED = createCompanySeed();

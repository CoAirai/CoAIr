import type {
  Company,
  CompanyFilters,
  PlatformTotals,
  User,
  UserFilters,
} from "./types";
import { COMPANIES, USERS } from "./demoData";
import { getPlanById } from "./plans";

export function getStorageRemaining(company: Company): number {
  return Math.max(0, company.storageLimitGb - company.storageUsedGb);
}

export function getTokensRemaining(company: Company): number {
  return Math.max(0, company.tokenLimit - company.tokensUsed);
}

export function getPlatformTotals(companies: Company[]): PlatformTotals {
  return companies.reduce<PlatformTotals>(
    (acc, c) => ({
      companyCount: acc.companyCount + 1,
      userCount: acc.userCount + c.usersCount,
      storageUsedGb: acc.storageUsedGb + c.storageUsedGb,
      storageLimitGb: acc.storageLimitGb + c.storageLimitGb,
      tokensUsed: acc.tokensUsed + c.tokensUsed,
      tokenLimit: acc.tokenLimit + c.tokenLimit,
    }),
    {
      companyCount: 0,
      userCount: 0,
      storageUsedGb: 0,
      storageLimitGb: 0,
      tokensUsed: 0,
      tokenLimit: 0,
    }
  );
}

export function filterCompanies(
  companies: Company[],
  filters: CompanyFilters
): Company[] {
  const q = filters.search?.trim().toLowerCase() ?? "";
  return companies.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (filters.planId && filters.planId !== "all" && c.planId !== filters.planId)
      return false;
    if (filters.status && filters.status !== "all" && c.status !== filters.status)
      return false;
    return true;
  });
}

export function filterUsers(users: User[], filters: UserFilters): User[] {
  const q = filters.search?.trim().toLowerCase() ?? "";
  return users.filter((u) => {
    if (
      q &&
      !u.name.toLowerCase().includes(q) &&
      !u.email.toLowerCase().includes(q)
    )
      return false;
    if (
      filters.companyId &&
      filters.companyId !== "all" &&
      u.companyId !== filters.companyId
    )
      return false;
    if (filters.status && filters.status !== "all" && u.status !== filters.status)
      return false;
    return true;
  });
}

export function getCompanyById(id: string) {
  return COMPANIES.find((c) => c.id === id) ?? null;
}

export function getUsersByCompanyId(companyId: string) {
  return USERS.filter((u) => u.companyId === companyId);
}

export { getPlanById };

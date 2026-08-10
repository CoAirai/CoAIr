import type { InvoiceStatus } from "./billingTypes";

export function isValidInviteEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function maskApiKey(key: string): string {
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 11)}••••••••••••${key.slice(-2)}`;
}

export function retryInvoiceStatus(status: InvoiceStatus): InvoiceStatus {
  if (status === "past_due") return "open";
  return status;
}

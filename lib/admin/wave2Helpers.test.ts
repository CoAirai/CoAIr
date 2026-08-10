import { describe, it, expect } from "vitest";
import {
  maskApiKey,
  isValidInviteEmail,
  retryInvoiceStatus,
} from "./wave2Helpers";

describe("maskApiKey", () => {
  it("keeps prefix and masks the rest", () => {
    expect(maskApiKey("coair_live_abcdefghijklmnop")).toBe(
      "coair_live_••••••••••••op"
    );
  });
});

describe("isValidInviteEmail", () => {
  it("accepts simple emails", () => {
    expect(isValidInviteEmail("owner@acme.com")).toBe(true);
  });
  it("rejects empty and invalid", () => {
    expect(isValidInviteEmail("")).toBe(false);
    expect(isValidInviteEmail("not-an-email")).toBe(false);
  });
});

describe("retryInvoiceStatus", () => {
  it("moves past_due to open", () => {
    expect(retryInvoiceStatus("past_due")).toBe("open");
  });
  it("leaves paid unchanged", () => {
    expect(retryInvoiceStatus("paid")).toBe("paid");
  });
});

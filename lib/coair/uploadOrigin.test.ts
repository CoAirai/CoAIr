import { afterEach, expect, it, vi } from "vitest";
import { resolveUploadApiBase } from "./workspace";

afterEach(() => vi.unstubAllEnvs());

it("keeps an Azure upload on its configured API instead of the production VPS", () => {
    const origin = "https://coair-azure-kadirsen.westeurope.cloudapp.azure.com";
    vi.stubEnv("NEXT_PUBLIC_COAIR_UPLOAD_BASE", `${origin}/api`);
    vi.stubEnv("NEXT_PUBLIC_COAIR_API_ORIGIN", "https://api.coair.ai");
    expect(resolveUploadApiBase()).toBe(`${origin}/api`);
});

it("normalizes a configured API origin without duplicating its api path", () => {
    vi.stubEnv("NEXT_PUBLIC_COAIR_UPLOAD_BASE", "https://isolated.example/api/");
    expect(resolveUploadApiBase()).toBe("https://isolated.example/api");
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../app/coair-api/[...path]/route";

describe("private storage upload proxy", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("forwards multipart bytes as a stream with auth and project identity", async () => {
        const content = "--fixture\r\nContent-Disposition: form-data; name=file\r\n\r\nPDF_BYTES\r\n--fixture--";
        const request = new NextRequest("http://localhost/coair-api/upload", {
            method: "POST", body: content,
            headers: { "content-type": "multipart/form-data; boundary=fixture",
                authorization: "Bearer fixture-token", "x-project-id": "project-a" },
        });
        const buffer = vi.spyOn(request, "arrayBuffer");
        const upstream = vi.fn(async (_url: string, options: RequestInit & { duplex?: string }) => {
            expect(options.duplex).toBe("half");
            expect(options.body).toBe(request.body);
            expect(new Headers(options.headers).get("authorization")).toBe("Bearer fixture-token");
            expect(new Headers(options.headers).get("x-project-id")).toBe("project-a");
            expect(await new Response(options.body).text()).toBe(content);
            return new Response('{"status":"queued"}', { status: 200 });
        });
        vi.stubGlobal("fetch", upstream);
        const response = await POST(request, { params: Promise.resolve({ path: ["upload"] }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "queued" });
        expect(buffer).not.toHaveBeenCalled();
        expect(upstream).toHaveBeenCalledTimes(1);
    });

    it("never replays a non-idempotent streamed upload after an API error", async () => {
        const request = new NextRequest("http://localhost/coair-api/upload", {
            method: "POST", body: "fixture-bytes",
            headers: { "content-type": "multipart/form-data; boundary=fixture" },
        });
        const upstream = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
        vi.stubGlobal("fetch", upstream);
        const response = await POST(request, { params: Promise.resolve({ path: ["upload"] }) });
        expect(response.status).toBe(503);
        expect(upstream).toHaveBeenCalledTimes(1);
    });

    it("preserves the existing JSON request contract", async () => {
        const request = new NextRequest("http://localhost/coair-api/upload/direct", {
            method: "POST", body: '{"filename":"scan.pdf"}',
            headers: { "content-type": "application/json" },
        });
        const upstream = vi.fn(async (_url: string, options: RequestInit & { duplex?: string }) => {
            expect(options.duplex).toBeUndefined();
            expect(new TextDecoder().decode(options.body as ArrayBuffer)).toBe('{"filename":"scan.pdf"}');
            return new Response('{"mode":"proxy"}');
        });
        vi.stubGlobal("fetch", upstream);
        const response = await POST(request, { params: Promise.resolve({ path: ["upload", "direct"] }) });
        expect(await response.json()).toEqual({ mode: "proxy" });
    });
});

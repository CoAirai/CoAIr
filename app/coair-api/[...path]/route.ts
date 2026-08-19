import { NextRequest, NextResponse } from "next/server";

const apiOrigin = (
    process.env.COAIR_API_ORIGIN ?? "http://localhost:8000"
).replace(/\/$/, "");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "cookie",
    "content-length",
    "content-encoding",
    "accept-encoding",
    "cf-connecting-ip",
    "cf-ipcountry",
    "cf-ray",
    "cf-visitor",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-vercel-id",
    "x-vercel-forwarded-for",
    "x-real-ip",
]);

function outgoingHeaders(request: NextRequest): Headers {
    const headers = new Headers();
    request.headers.forEach((value, key) => {
        if (HOP_BY_HOP.has(key.toLowerCase())) return;
        headers.set(key, value);
    });
    headers.set("bypass-tunnel-reminder", "true");
    headers.set("User-Agent", "CoAir-Proxy/1.0");
    return headers;
}

function incomingHeaders(res: Response): Headers {
    const headers = new Headers();
    res.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (
            lower === "transfer-encoding" ||
            lower === "content-encoding" ||
            lower === "content-length" ||
            lower === "connection"
        ) {
            return;
        }
        headers.set(key, value);
    });
    return headers;
}

async function handler(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const target = `${apiOrigin}/api/${path.join("/")}`;
    const url = new URL(target);
    url.search = request.nextUrl.search;

    const method = request.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    const body = hasBody ? await request.arrayBuffer() : undefined;

    try {
        const res = await fetch(url.toString(), {
            method,
            headers: outgoingHeaders(request),
            body: body && body.byteLength > 0 ? body : undefined,
            redirect: "manual",
            cache: "no-store",
        });

        const payload = await res.arrayBuffer();
        return new NextResponse(payload, {
            status: res.status,
            statusText: res.statusText,
            headers: incomingHeaders(res),
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "API proxy failed";
        return NextResponse.json(
            { error: "api_unreachable", message },
            { status: 502 }
        );
    }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

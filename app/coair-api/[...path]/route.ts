import { NextRequest, NextResponse } from "next/server";

const apiOrigin = process.env.COAIR_API_ORIGIN ?? "http://localhost:8000";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const target = `${apiOrigin}/api/${path.join("/")}`;
  const url = new URL(target);
  url.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.set("bypass-tunnel-reminder", "true");
  headers.delete("host");

  const res = await fetch(url.toString(), {
    method: request.method,
    headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    // @ts-expect-error duplex needed for streaming body
    duplex: "half",
  });

  const responseHeaders = new Headers(res.headers);
  responseHeaders.delete("transfer-encoding");

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

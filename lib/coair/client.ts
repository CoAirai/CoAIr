export const COAIR_API_BASE =
    process.env.NEXT_PUBLIC_COAIR_API_BASE ?? "/coair-api";

export class CoairApiError extends Error {
    status: number;
    body: string;

    constructor(message: string, status: number, body = "") {
        super(message);
        this.name = "CoairApiError";
        this.status = status;
        this.body = body;
    }
}

type CoairFetchOptions = {
    method?: string;
    token?: string | null;
    projectId?: string | null;
    body?: unknown;
    timeoutMs?: number;
};

export function isApiUnreachable(error: unknown): boolean {
    if (!(error instanceof CoairApiError)) return false;
    if (error.status === 0) return true;
    if (error.status === 429 || error.status === 502 || error.status === 503 || error.status === 504) {
        return true;
    }
    const body = error.body.toLowerCase();
    const message = error.message.toLowerCase();
    return (
        body.includes("tunnel unavailable") ||
        body.includes("tunnel website ahead") ||
        body.includes("tunnel is busy") ||
        message.includes("tunnel is busy")
    );
}

function shouldRetry(error: CoairApiError, method: string): boolean {
    if (method !== "GET" && method !== "HEAD") return false;
    return isApiUnreachable(error) || error.message.toLowerCase().includes("busy");
}

async function sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function once<T>(
    path: string,
    options: CoairFetchOptions
): Promise<T> {
    const {
        method = "GET",
        token,
        projectId,
        body,
        timeoutMs = 30000,
    } = options;
    const headers: Record<string, string> = { Accept: "application/json" };
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isForm) {
        headers["Content-Type"] = "application/json";
    }
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    if (projectId) {
        headers["X-Project-ID"] = projectId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${COAIR_API_BASE}${path}`, {
            method,
            headers,
            body:
                body === undefined
                    ? undefined
                    : isForm
                      ? (body as FormData)
                      : JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            throw new CoairApiError(
                clean || response.statusText || "Request failed",
                response.status,
                text
            );
        }

        if (response.status === 204) {
            return undefined as T;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
            const text = await response.text().catch(() => "");
            if (/tunnel is busy/i.test(text)) {
                throw new CoairApiError("Tunnel is busy, try again later", 429, text);
            }
            return undefined as T;
        }

        return (await response.json()) as T;
    } catch (error) {
        if (error instanceof CoairApiError) {
            throw error;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new CoairApiError("Request timed out", 0);
        }
        throw new CoairApiError(
            error instanceof Error ? error.message : "Network error",
            0
        );
    } finally {
        clearTimeout(timer);
    }
}

export async function coairFetch<T>(
    path: string,
    options: CoairFetchOptions = {}
): Promise<T> {
    const method = (options.method ?? "GET").toUpperCase();
    let lastError: CoairApiError | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            return await once<T>(path, options);
        } catch (error) {
            if (!(error instanceof CoairApiError) || !shouldRetry(error, method)) {
                throw error;
            }
            lastError = error;
            await sleep(600 * (attempt + 1));
        }
    }
    throw lastError ?? new CoairApiError("Request failed", 0);
}

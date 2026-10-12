import { coairFetch } from "@/lib/coair/client";

export type CoairNotice = {
    id: string;
    title: string;
    body: string;
    href: string;
    created_at: string;
    read_at?: string | null;
};

export async function listNotices(token: string) {
    return coairFetch<{ notices: CoairNotice[]; unread: number }>("/notices", {
        token,
    });
}

export async function markNoticesRead(token: string, ids?: string[]) {
    return coairFetch<{ ok: boolean }>("/notices/read", {
        method: "POST",
        token,
        body: { ids: ids ?? null },
    });
}

export async function reportFinishedResponse(
    token: string,
    title: string,
    body: string,
    href: string
) {
    return coairFetch<{ ok: boolean }>("/notices", {
        method: "POST",
        token,
        body: { title, body, href },
    });
}

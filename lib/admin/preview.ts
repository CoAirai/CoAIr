export function withPreview<T>(
    live: T[],
    fallback: T[],
    ready = true
): { rows: T[]; preview: boolean } {
    if (!ready) {
        return { rows: live, preview: false };
    }
    if (live.length > 0) {
        return { rows: live, preview: false };
    }
    return { rows: fallback, preview: true };
}

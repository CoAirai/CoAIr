export function bytesToGb(bytes?: number | null) {
    return Math.round(((bytes ?? 0) / (1024 ** 3)) * 10) / 10;
}

export function planLabel(planType?: string | null) {
    if (!planType) return "—";
    const labels: Record<string, string> = {
        demo: "Demo",
        legacy: "Legacy",
        foundation: "Foundation",
        pro: "Pro",
        enterprise: "Enterprise",
        custom: "Custom",
    };
    return labels[planType] || planType;
}

export type WeekWindow = {
    label: string;
    from: string;
    to: string;
};

export function weekWindows(count = 8, now = new Date()): WeekWindow[] {
    const end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)
    );
    const windows: WeekWindow[] = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        const weekEnd = new Date(end);
        weekEnd.setUTCDate(end.getUTCDate() - i * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setUTCDate(weekEnd.getUTCDate() - 6);
        weekStart.setUTCHours(0, 0, 0, 0);
        windows.push({
            label: weekStart.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
            }),
            from: weekStart.toISOString(),
            to: weekEnd.toISOString(),
        });
    }
    return windows;
}

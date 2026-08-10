export function ownedByUser<T extends { ownerUserId?: string }>(
    items: T[],
    userId: string | null | undefined
): T[] {
    if (!userId) return items;
    return items.filter((item) => item.ownerUserId === userId);
}

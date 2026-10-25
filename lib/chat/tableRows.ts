/** Filtering and sorting never change the retained result or exported row order. */
export function filterSortRows(rows: string[][], query: string, sort: { column: number; descending: boolean } | null): string[][] {
    const needle = query.trim().toLowerCase();
    const visible = rows.filter(row => !needle || row.some(cell => cell.toLowerCase().includes(needle)));
    if (!sort) return visible;
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    const number = (text: string) => /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text.trim()) ? Number(text) : null;
    return visible.sort((left, right) => {
        const a = left[sort.column] ?? "", b = right[sort.column] ?? "";
        const an = number(a), bn = number(b);
        const comparison = an !== null && bn !== null ? an - bn : collator.compare(a, b);
        return sort.descending ? -comparison : comparison;
    });
}

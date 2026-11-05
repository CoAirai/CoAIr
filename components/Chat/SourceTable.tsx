import { sourceRowAnchor, type CoairDocContent } from "@/lib/coair/documents";
import { sqlCell } from "@/lib/chat/sqlArtifact";

/** The same source rows in the side panel and expanded document viewer. */
export default function SourceTable({ content, onRowsChange }: { content: CoairDocContent; onRowsChange?: (anchor: string) => void }) {
    const rows = content.rows ?? [];
    const columns = content.columns?.length ? content.columns : Object.keys(rows[0] ?? {});
    return <div className="overflow-auto text-label-xs" aria-label="Source table">
        <div className="mb-2 text-label-sm font-medium text-strong-950">{content.sheet_name || content.file_name}</div>
        <table className="w-full border-collapse">
            <thead><tr>{columns.map((column, i) => <th key={i} className="border-b border-stroke-soft-200 px-2 py-2 text-left">{column}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i}>{columns.map((column, j) => <td key={j} className="border-b border-stroke-soft-200 px-2 py-2 text-sub-600">{sqlCell(row[column])}</td>)}</tr>)}</tbody>
        </table>
        <p className="mt-2 text-soft-400">Rows {content.row_from ?? 1}–{content.row_to ?? rows.length} ({content.total_rows ?? rows.length} total).</p>
        {onRowsChange && <div className="mt-2 flex gap-3">
            <button type="button" className="rounded px-2 py-1 hover:bg-weak-50 disabled:opacity-40" disabled={(content.row_from ?? 1) <= 2} onClick={() => onRowsChange(sourceRowAnchor(content, -1))}>Previous rows</button>
            <button type="button" className="rounded px-2 py-1 hover:bg-weak-50 disabled:opacity-40" disabled={(content.row_to ?? rows.length) >= (content.total_rows ?? rows.length) + (((content.row_from ?? 1) - 1) % 50)} onClick={() => onRowsChange(sourceRowAnchor(content, 1))}>Next rows</button>
        </div>}
    </div>;
}

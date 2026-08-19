import { useRef, useCallback } from 'react';
import type { ReactNode } from 'react';

/**
 * A markdown table inside a chat bubble.
 *
 * Two things a plain <table> gets wrong here. It must not stretch to the
 * bubble: `w-full` would squeeze twelve columns into the column width and make
 * horizontal scrolling impossible, so the table is `min-w-max` and the wrapper
 * scrolls. And a long table must not push the rest of the conversation off
 * screen, so the wrapper caps its height and the header sticks while the body
 * scrolls under it.
 *
 * The CSV comes from the rendered cells rather than from the markdown source:
 * by the time we are here the source is gone, and the DOM is exactly what the
 * reader is looking at.
 */
export default function MarkdownTable({ children }: { children?: ReactNode }) {
  const tableRef = useRef<HTMLTableElement>(null);

  const downloadCsv = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const escape = (value: string) =>
      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const csv = Array.from(table.querySelectorAll('tr'))
      .map((row) =>
        Array.from(row.querySelectorAll('th, td'))
          .map((cell) => escape((cell.textContent ?? '').trim()))
          .join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `table_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="my-3 rounded-lg border border-[var(--border)] overflow-hidden">
      <div className="flex justify-end px-2 py-1 border-b border-[var(--border)] bg-[var(--bg-primary)]">
        <button
          type="button"
          onClick={downloadCsv}
          className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
        >
          Download CSV
        </button>
      </div>
      {/* Both axes: wide tables scroll sideways, long ones scroll under a
          pinned header instead of stretching the conversation. */}
      <div className="overflow-auto max-h-[70vh]">
        <table ref={tableRef} className="min-w-max text-xs border-collapse">
          {children}
        </table>
      </div>
    </div>
  );
}

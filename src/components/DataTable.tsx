import { useMemo, useCallback } from 'react';

// ============================================
// GENERIC DATA TABLE COMPONENT
// ============================================

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: string;
  direction: SortDirection;
}

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right';
  hidden?: 'mobile';
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  sortState: SortState | null;
  onSort: (sort: SortState) => void;
  onExportCSV?: () => void;
  maxHeight?: string;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  totalCount?: number;
  resultCap?: number;
}

function SortIndicator({ direction }: { direction: SortDirection | null }) {
  if (!direction) {
    return (
      <svg className="w-4 h-4 text-slate-300 ml-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return direction === 'asc' ? (
    <svg className="w-4 h-4 text-texas-blue ml-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-texas-blue ml-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <tr key={rowIdx} className="animate-pulse">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <td key={colIdx} className="px-4 py-3">
              <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function exportToCSV<T>(
  data: T[],
  columns: Column<T>[],
  filename: string
) {
  const headers = columns.map(c => c.header);
  const rows = data.map(row =>
    columns.map(col => {
      const val = (row as Record<string, unknown>)[col.key];
      if (val == null) return '';
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma/quote/newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
  );

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataTable<T>({
  columns,
  data,
  loading = false,
  sortState,
  onSort,
  onExportCSV,
  maxHeight = '70vh',
  emptyMessage = 'No results found. Try adjusting your search criteria.',
  rowKey,
  totalCount,
  resultCap = 5000,
}: DataTableProps<T>) {
  const visibleColumns = useMemo(
    () => columns, // all columns passed through; hiding handled via CSS class
    [columns]
  );

  const handleHeaderClick = useCallback(
    (column: string) => {
      if (sortState?.column === column) {
        // Toggle direction, or reset
        if (sortState.direction === 'asc') {
          onSort({ column, direction: 'desc' });
        } else {
          // Already desc — cycle back to asc
          onSort({ column, direction: 'asc' });
        }
      } else {
        onSort({ column, direction: 'asc' });
      }
    },
    [sortState, onSort]
  );

  const isCapped = totalCount != null && totalCount > resultCap;

  return (
    <div>
      {/* Result count + export bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
        <span>
          {loading ? (
            'Searching...'
          ) : (
            <>
              {data.length.toLocaleString()} result{data.length !== 1 ? 's' : ''}
              {isCapped && (
                <span className="text-amber-600 ml-2">
                  (showing first {resultCap.toLocaleString()} of {totalCount!.toLocaleString()} — refine your search for complete results)
                </span>
              )}
            </>
          )}
        </span>
        {onExportCSV && data.length > 0 && (
          <button
            onClick={onExportCSV}
            className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>
        )}
      </div>

      {/* Scrollable table container */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr className="border-b border-slate-200 text-left">
              {visibleColumns.map(col => {
                const isActive = sortState?.column === col.key;
                const cellClass = [
                  'px-4 py-3 text-sm font-semibold text-slate-900 transition-colors',
                  col.sortable !== false ? 'cursor-pointer hover:bg-slate-100 select-none' : '',
                  col.align === 'right' ? 'text-right' : '',
                  col.hidden === 'mobile' ? 'hidden md:table-cell' : '',
                ].filter(Boolean).join(' ');

                return (
                  <th
                    key={col.key}
                    className={cellClass}
                    onClick={col.sortable !== false ? () => handleHeaderClick(col.key) : undefined}
                  >
                    <span className="flex items-center">
                      {col.header}
                      {col.sortable !== false && (
                        <SortIndicator direction={isActive ? sortState!.direction : null} />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <LoadingRows cols={visibleColumns.length} />
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-12 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map(row => (
                <tr key={rowKey(row)} className="hover:bg-slate-50">
                  {visibleColumns.map(col => {
                    const cellClass = [
                      'px-4 py-3 text-sm',
                      col.align === 'right' ? 'text-right' : '',
                      col.hidden === 'mobile' ? 'hidden md:table-cell' : '',
                    ].filter(Boolean).join(' ');

                    return (
                      <td key={col.key} className={cellClass}>
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

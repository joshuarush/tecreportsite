import { useState, useMemo } from 'react';
import { formatCurrency, formatDate } from '../lib/search';
import type { Contribution, Filer, Expenditure } from '../lib/search';

interface ContributionsTableProps {
  type: 'contributions';
  data: Contribution[];
  loading?: boolean;
}

interface FilersTableProps {
  type: 'filers';
  data: Filer[];
  loading?: boolean;
}

interface ExpendituresTableProps {
  type: 'expenditures';
  data: Expenditure[];
  loading?: boolean;
}

type ResultsTableProps = ContributionsTableProps | FilersTableProps | ExpendituresTableProps;

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

// Sort indicator arrow component
function SortIndicator({ direction }: { direction: SortDirection }) {
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

// Sortable header component
function SortableHeader({
  label,
  column,
  sortState,
  onSort,
  className = ''
}: {
  label: string;
  column: string;
  sortState: SortState;
  onSort: (column: string) => void;
  className?: string;
}) {
  const isActive = sortState.column === column;
  return (
    <th
      className={`px-4 py-3 text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-100 select-none transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="flex items-center">
        {label}
        <SortIndicator direction={isActive ? sortState.direction : null} />
      </span>
    </th>
  );
}

// Generic sort function
function sortData<T>(data: T[], sortState: SortState): T[] {
  if (!sortState.column || !sortState.direction) return data;

  return [...data].sort((a, b) => {
    const aVal = (a as any)[sortState.column!];
    const bVal = (b as any)[sortState.column!];

    // Handle null/undefined
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return sortState.direction === 'asc' ? -1 : 1;
    if (bVal == null) return sortState.direction === 'asc' ? 1 : -1;

    // Handle numbers
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // Handle strings (case-insensitive)
    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    const comparison = aStr.localeCompare(bStr);
    return sortState.direction === 'asc' ? comparison : -comparison;
  });
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        </td>
      ))}
    </tr>
  );
}

export default function ResultsTable(props: ResultsTableProps) {
  const { type, data, loading } = props;
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  const handleSort = (column: string) => {
    setSortState(prev => {
      if (prev.column !== column) {
        return { column, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      // Reset to no sort
      return { column: null, direction: null };
    });
  };

  // Sort data based on type - all hooks called unconditionally
  const sortedContributions = useMemo(
    () => type === 'contributions' ? sortData(data as Contribution[], sortState) : [],
    [type, data, sortState]
  );
  const sortedFilers = useMemo(
    () => type === 'filers' ? sortData(data as Filer[], sortState) : [],
    [type, data, sortState]
  );
  const sortedExpenditures = useMemo(
    () => type === 'expenditures' ? sortData(data as Expenditure[], sortState) : [],
    [type, data, sortState]
  );

  if (type === 'contributions') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <SortableHeader label="Contributor" column="contributor_name" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Recipient" column="filer_name" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Amount" column="amount" sortState={sortState} onSort={handleSort} className="text-right" />
              <SortableHeader label="Date" column="date" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Location" column="contributor_city" sortState={sortState} onSort={handleSort} className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <>
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
              </>
            ) : sortedContributions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No contributions found. Try adjusting your search criteria.
                </td>
              </tr>
            ) : (
              sortedContributions.map((contribution) => (
                <tr key={contribution.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a
                      href={`/search/contributors?q=${encodeURIComponent(contribution.contributor_name || '')}${contribution.contributor_city ? `&city=${encodeURIComponent(contribution.contributor_city)}` : ''}`}
                      className="font-medium text-texas-blue hover:text-blue-700 text-sm block"
                    >
                      {contribution.contributor_name || 'Unknown'}
                    </a>
                    {contribution.contributor_employer && (
                      <div className="text-xs text-slate-500">
                        {contribution.contributor_employer}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/candidate?id=${contribution.filer_id}`}
                      className="text-sm text-texas-blue hover:text-blue-700"
                    >
                      {contribution.filer_name || contribution.filer_id}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-green-700 text-sm">
                      {formatCurrency(contribution.amount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(contribution.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">
                    {contribution.contributor_city}
                    {contribution.contributor_state && `, ${contribution.contributor_state}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'filers') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <SortableHeader label="Name" column="name" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Type" column="type" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Office" column="office_held" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Party" column="party" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Status" column="status" sortState={sortState} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <>
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
              </>
            ) : sortedFilers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No filers found. Try adjusting your search criteria.
                </td>
              </tr>
            ) : (
              sortedFilers.map((filer) => (
                <tr key={filer.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a
                      href={`/candidate?id=${filer.id}`}
                      className="font-medium text-texas-blue hover:text-blue-700 text-sm"
                    >
                      {filer.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.type || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.office_held || '—'}
                    {filer.office_district && ` - District ${filer.office_district}`}
                  </td>
                  <td className="px-4 py-3">
                    {filer.party && (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        filer.party === 'REPUBLICAN' ? 'bg-red-100 text-red-800' :
                        filer.party === 'DEMOCRAT' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {filer.party}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.status || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // Expenditures table
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <SortableHeader label="Payer" column="filer_name" sortState={sortState} onSort={handleSort} />
            <SortableHeader label="Payee" column="payee_name" sortState={sortState} onSort={handleSort} />
            <SortableHeader label="Amount" column="amount" sortState={sortState} onSort={handleSort} className="text-right" />
            <SortableHeader label="Date" column="date" sortState={sortState} onSort={handleSort} />
            <SortableHeader label="Category" column="category" sortState={sortState} onSort={handleSort} className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <>
              <LoadingRow cols={5} />
              <LoadingRow cols={5} />
              <LoadingRow cols={5} />
            </>
          ) : sortedExpenditures.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                No expenditures found. Try adjusting your search criteria.
              </td>
            </tr>
          ) : (
            sortedExpenditures.map((expenditure) => (
              <tr key={expenditure.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <a
                    href={`/candidate?id=${expenditure.filer_id}`}
                    className="text-sm text-texas-blue hover:text-blue-700"
                  >
                    {expenditure.filer_name || expenditure.filer_id}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 text-sm">
                    {expenditure.payee_name || 'Unknown'}
                  </div>
                  {expenditure.description && (
                    <div className="text-xs text-slate-500 truncate max-w-xs">
                      {expenditure.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-medium text-texas-red text-sm">
                    {formatCurrency(expenditure.amount)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatDate(expenditure.date)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">
                  {expenditure.category || '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import FacetedFilters, { type FilterValues } from './FacetedFilters';
import DataTable, { exportToCSV, type SortState, type Column } from './DataTable';
import DatabaseLoader from './DatabaseLoader';
import { searchContributionsFull, formatCurrency, formatDate, type SearchFilters, type Contribution, type SortParams } from '../lib/search';

interface ContributorSearchProps {
  initialQuery?: string;
}

const COLUMNS: Column<Contribution>[] = [
  {
    key: 'contributor_name',
    header: 'Contributor',
    render: (row) => (
      <div>
        <a
          href={`/search/contributors?q=${encodeURIComponent(row.contributor_name || '')}${row.contributor_city ? `&city=${encodeURIComponent(row.contributor_city)}` : ''}`}
          className="font-medium text-texas-blue hover:text-blue-700 text-sm block"
        >
          {row.contributor_name || 'Unknown'}
        </a>
        {row.contributor_employer && (
          <div className="text-xs text-slate-500">{row.contributor_employer}</div>
        )}
      </div>
    ),
  },
  {
    key: 'filer_name',
    header: 'Recipient',
    render: (row) => (
      <a href={`/candidate?id=${row.filer_id}`} className="text-sm text-texas-blue hover:text-blue-700">
        {row.filer_name || row.filer_id}
      </a>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (row) => (
      <span className="font-medium text-green-700 text-sm">{formatCurrency(row.amount)}</span>
    ),
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => <span className="text-slate-600">{formatDate(row.date)}</span>,
  },
  {
    key: 'contributor_city',
    header: 'Location',
    hidden: 'mobile',
    render: (row) => (
      <span className="text-slate-600">
        {row.contributor_city}
        {row.contributor_state && `, ${row.contributor_state}`}
      </span>
    ),
  },
];

export default function ContributorSearch({ initialQuery = '' }: ContributorSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<FilterValues>({
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: '',
    contributorType: '',
    party: '',
    officeType: '',
    filerType: '',
  });
  const [results, setResults] = useState<Contribution[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [sortState, setSortState] = useState<SortState | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlQuery = params.get('q');
      if (urlQuery) {
        setQuery(urlQuery);
      }
      setInitialized(true);
    }
  }, []);

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const searchFilters: SearchFilters = {
        query: query || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        amountMin: filters.amountMin ? parseFloat(filters.amountMin) : undefined,
        amountMax: filters.amountMax ? parseFloat(filters.amountMax) : undefined,
        contributorType: filters.contributorType || undefined,
      };

      const result = await searchContributionsFull(
        searchFilters,
        sortState as SortParams | undefined
      );

      setResults(result.data);
      setTotalCount(result.totalCount);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, filters, sortState]);

  useEffect(() => {
    if (initialized) {
      performSearch();
    }
  }, [initialized, filters, sortState]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
  };

  const handleSort = useCallback((sort: SortState) => {
    setSortState(sort);
  }, []);

  const handleExportCSV = useCallback(() => {
    exportToCSV(results, COLUMNS, `tec-contributions-${new Date().toISOString().split('T')[0]}.csv`);
  }, [results]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  return (
    <DatabaseLoader>
    <div className="space-y-6">
      {/* Search Input */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by contributor name..."
            className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-texas-blue focus:border-transparent"
          />
          <svg
            className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-texas-blue text-white font-medium rounded-xl hover:bg-blue-800 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Filters */}
      <FacetedFilters
        filters={filters}
        onChange={handleFilterChange}
        showContributorFilters={true}
      />

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <DataTable
          columns={COLUMNS}
          data={results}
          loading={loading}
          sortState={sortState}
          onSort={handleSort}
          onExportCSV={handleExportCSV}
          rowKey={(row) => row.contribution_id || row.id || String(Math.random())}
          totalCount={totalCount}
          emptyMessage="No contributions found. Try adjusting your search criteria."
        />
      </div>
    </div>
    </DatabaseLoader>
  );
}

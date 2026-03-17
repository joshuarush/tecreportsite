import { useState, useEffect, useCallback } from 'react';
import FacetedFilters, { type FilterValues } from './FacetedFilters';
import DataTable, { exportToCSV, type SortState, type Column } from './DataTable';
import DatabaseLoader from './DatabaseLoader';
import { searchFilersFull, type SearchFilters, type SortParams, type Filer } from '../lib/search';

interface CandidateSearchProps {
  initialQuery?: string;
}

const COLUMNS: Column<Filer>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (row) => (
      <a href={`/candidate?id=${row.id}`} className="font-medium text-texas-blue hover:text-blue-700 text-sm">
        {row.name}
      </a>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    render: (row) => <span className="text-slate-600">{row.type || '—'}</span>,
  },
  {
    key: 'office_held',
    header: 'Office',
    render: (row) => (
      <span className="text-slate-600">
        {row.office_held || '—'}
        {row.office_district && ` - District ${row.office_district}`}
      </span>
    ),
  },
  {
    key: 'party',
    header: 'Party',
    render: (row) =>
      row.party ? (
        <span
          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
            row.party === 'REPUBLICAN'
              ? 'bg-red-100 text-red-800'
              : row.party === 'DEMOCRAT'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-slate-100 text-slate-800'
          }`}
        >
          {row.party}
        </span>
      ) : null,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <span className="text-slate-600">{row.status || '—'}</span>,
  },
];

export default function CandidateSearch({ initialQuery = '' }: CandidateSearchProps) {
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
  const [results, setResults] = useState<Filer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sortState, setSortState] = useState<SortState | null>(null);

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const searchFilters: SearchFilters = {
        query: query || undefined,
        party: filters.party || undefined,
        officeType: filters.officeType || undefined,
        filerType: filters.filerType || undefined,
      };

      const result = await searchFilersFull(
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
    performSearch();
  }, [filters, sortState]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
  };

  const handleSort = useCallback((sort: SortState) => {
    setSortState(sort);
  }, []);

  const handleExportCSV = useCallback(() => {
    exportToCSV(results, COLUMNS, `tec-filers-${new Date().toISOString().split('T')[0]}.csv`);
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
            placeholder="Search by committee or candidate name..."
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
        showContributorFilters={false}
        showCandidateFilters={true}
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
          rowKey={(row) => row.id}
          totalCount={totalCount}
          emptyMessage="No committees or candidates found. Try adjusting your search criteria."
        />
      </div>
    </div>
    </DatabaseLoader>
  );
}

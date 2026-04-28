import { useState, useEffect, useCallback } from 'react';
import DataTable, { exportToCSV, type SortState } from './DataTable';
import DatabaseLoader from './DatabaseLoader';
import {
  searchExpendituresFull,
  type SearchFilters,
  type Expenditure,
  type SortParams,
} from '../lib/search';
import { EXPENDITURE_COLUMNS } from '../lib/transaction-columns';

interface PayeeSearchProps {
  initialQuery?: string;
}

const EXPENDITURE_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'ADVERTISING', label: 'Advertising' },
  { value: 'CAMPAIGN_LITERATURE', label: 'Campaign Literature' },
  { value: 'CAMPAIGN_EVENT', label: 'Campaign Event' },
  { value: 'CONSULTING', label: 'Consulting' },
  { value: 'CONTRIBUTION', label: 'Contribution to Another Committee' },
  { value: 'FOOD_BEVERAGE', label: 'Food/Beverage' },
  { value: 'FUNDRAISING', label: 'Fundraising' },
  { value: 'LOAN_REPAYMENT', label: 'Loan Repayment' },
  { value: 'OFFICE', label: 'Office/Overhead' },
  { value: 'POLLING', label: 'Polling/Research' },
  { value: 'SALARIES', label: 'Salaries/Wages' },
  { value: 'TRAVEL', label: 'Travel/Lodging' },
  { value: 'UNKNOWN', label: 'Other/Unknown' },
];

export default function PayeeSearch({ initialQuery = '' }: PayeeSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: '',
    category: '',
    filerName: '',
    city: '',
    state: '',
  });
  const [results, setResults] = useState<Expenditure[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [sortState, setSortState] = useState<SortState | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setQuery(params.get('q') || initialQuery);
      setFilters((prev) => ({
        ...prev,
        city: params.get('city') || '',
        state: params.get('state') || '',
        category: params.get('category') || '',
        filerName: params.get('filer') || '',
      }));
      setInitialized(true);
    }
  }, [initialQuery]);

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const searchFilters: SearchFilters = {
        query: query || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        amountMin: filters.amountMin ? parseFloat(filters.amountMin) : undefined,
        amountMax: filters.amountMax ? parseFloat(filters.amountMax) : undefined,
        expenditureCategory: filters.category || undefined,
        filerName: filters.filerName || undefined,
        city: filters.city || undefined,
        state: filters.state || undefined,
      };

      const result = await searchExpendituresFull(
        searchFilters,
        sortState as SortParams | undefined
      );

      setResults(result.data);
      setTotalCount(result.totalCount);
    } catch (error) {
      console.error('Payee search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, filters, sortState]);

  useEffect(() => {
    if (initialized) {
      performSearch();
    }
  }, [initialized, filters, sortState]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      category: '',
      filerName: '',
      city: '',
      state: '',
    });
  };

  const handleSort = useCallback((sort: SortState) => {
    setSortState(sort);
  }, []);

  const handleExportCSV = useCallback(() => {
    exportToCSV(results, EXPENDITURE_COLUMNS, `tec-expenditures-${new Date().toISOString().split('T')[0]}.csv`);
  }, [results]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <DatabaseLoader>
      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by payee or vendor name..."
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

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Filters</h3>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-texas-red hover:text-red-700">
                Clear all
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date From</label>
              <input type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date To</label>
              <input type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min Amount</label>
              <input type="number" value={filters.amountMin} onChange={(e) => updateFilter('amountMin', e.target.value)} placeholder="$0" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Amount</label>
              <input type="number" value={filters.amountMax} onChange={(e) => updateFilter('amountMax', e.target.value)} placeholder="No limit" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select value={filters.category} onChange={(e) => updateFilter('category', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                {EXPENDITURE_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payer / Filer</label>
              <input type="text" value={filters.filerName} onChange={(e) => updateFilter('filerName', e.target.value)} placeholder="Committee or candidate" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payee City</label>
              <input type="text" value={filters.city} onChange={(e) => updateFilter('city', e.target.value)} placeholder="Austin" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payee State</label>
              <input type="text" value={filters.state} onChange={(e) => updateFilter('state', e.target.value.toUpperCase())} placeholder="TX" maxLength={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <DataTable
            columns={EXPENDITURE_COLUMNS}
            data={results}
            loading={loading}
            sortState={sortState}
            onSort={handleSort}
            onExportCSV={handleExportCSV}
            rowKey={(row) => row.expenditure_id || row.id || String(Math.random())}
            totalCount={totalCount}
            emptyMessage="No expenditures found. Try adjusting your search criteria."
          />
        </div>
      </div>
    </DatabaseLoader>
  );
}

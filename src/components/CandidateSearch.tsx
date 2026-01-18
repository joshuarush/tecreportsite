import { useState, useEffect, useCallback } from 'react';
import FacetedFilters, { type FilterValues } from './FacetedFilters';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
import { searchFilers, type SearchFilters } from '../lib/search';
import type { Filer } from '../lib/search';

interface CandidateSearchProps {
  initialQuery?: string;
}

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
  });
  const [results, setResults] = useState<Filer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const pageSize = 25;

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const searchFilters: SearchFilters = {
        query: query || undefined,
        party: filters.party || undefined,
        officeType: filters.officeType || undefined,
      };

      const result = await searchFilers(searchFilters, {
        page: currentPage,
        pageSize,
      });

      setResults(result.data);
      setTotalCount(result.count);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, filters, currentPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [performSearch]);

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <DatabaseLoader>
    <div className="space-y-6">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search by candidate or committee name..."
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

      {/* Filters */}
      <FacetedFilters
        filters={filters}
        onChange={handleFilterChange}
        showContributorFilters={false}
        showCandidateFilters={true}
      />

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {loading ? 'Searching...' : `${totalCount.toLocaleString()} candidates & committees found`}
        </h2>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <ResultsTable type="filers" data={results} loading={loading} />
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalCount / pageSize)}
        totalResults={totalCount}
        pageSize={pageSize}
        onPageChange={handlePageChange}
      />
    </div>
    </DatabaseLoader>
  );
}

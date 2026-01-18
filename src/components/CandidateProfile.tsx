import { useState, useEffect, useCallback } from 'react';
import TopDonorsChart from './TopDonorsChart';
import ContributionTimeline from './ContributionTimeline';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
import {
  getFilerById,
  getTopDonorsFiltered,
  getTimelineData,
  getFilerStatsFiltered,
  searchContributions,
  formatCurrency,
  formatDateInt,
} from '../lib/search';
import type { Filer, Contribution, TimelineDataPoint } from '../lib/search';

interface CandidateProfileProps {
  filerId: string;
}

interface TopDonor {
  name: string;
  total: number;
  count: number;
}

type DatePreset = 'all' | '2024' | '2023' | '2022' | 'custom';

export default function CandidateProfile({ filerId }: CandidateProfileProps) {
  const [filer, setFiler] = useState<Filer | null>(null);
  const [topDonors, setTopDonors] = useState<TopDonor[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributionsTotal, setContributionsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  // Stats
  const [totalContributions, setTotalContributions] = useState(0);
  const [totalExpended, setTotalExpended] = useState(0);
  const [contributionCount, setContributionCount] = useState(0);
  const [dataDateRange, setDataDateRange] = useState<{ earliest: number | null; latest: number | null }>({
    earliest: null,
    latest: null,
  });

  // Date filtering
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const getDateRange = useCallback((): { from?: string; to?: string } => {
    const now = new Date();
    switch (datePreset) {
      case '2024':
        return { from: '2024-01-01', to: '2024-12-31' };
      case '2023':
        return { from: '2023-01-01', to: '2023-12-31' };
      case '2022':
        return { from: '2022-01-01', to: '2022-12-31' };
      case 'custom':
        return {
          from: customDateFrom || undefined,
          to: customDateTo || undefined,
        };
      default:
        return {};
    }
  }, [datePreset, customDateFrom, customDateTo]);

  // Load filer info (doesn't change with date filter)
  useEffect(() => {
    async function loadFiler() {
      setLoading(true);
      try {
        const profileData = await getFilerById(filerId);
        if (profileData) {
          setFiler(profileData.filer);
        }
      } catch (error) {
        console.error('Error loading filer:', error);
      } finally {
        setLoading(false);
      }
    }
    loadFiler();
  }, [filerId]);

  // Load filtered data (changes with date filter)
  useEffect(() => {
    async function loadFilteredData() {
      if (!filer) return;

      try {
        const { from, to } = getDateRange();

        const [stats, donors, timeline] = await Promise.all([
          getFilerStatsFiltered(filerId, from, to),
          getTopDonorsFiltered(filerId, 10, from, to),
          getTimelineData(filerId, from, to),
        ]);

        setTotalContributions(stats.totalContributions);
        setTotalExpended(stats.totalExpended);
        setContributionCount(stats.contributionCount);
        setDataDateRange(stats.dateRange);
        setTopDonors(donors);
        setTimelineData(timeline);
      } catch (error) {
        console.error('Error loading filtered data:', error);
      }
    }
    loadFilteredData();
  }, [filerId, filer, getDateRange]);

  // Load contributions for table (with pagination)
  useEffect(() => {
    async function loadContributions() {
      if (!filer) return;

      try {
        const { from, to } = getDateRange();
        const result = await searchContributions(
          {
            filerId,
            dateFrom: from,
            dateTo: to,
          },
          { page: currentPage, pageSize }
        );
        setContributions(result.data);
        setContributionsTotal(result.count);
      } catch (error) {
        console.error('Error loading contributions:', error);
      }
    }
    loadContributions();
  }, [filerId, filer, currentPage, getDateRange]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [datePreset, customDateFrom, customDateTo]);

  const cashOnHand = totalContributions - totalExpended;

  // Format date range for display
  const getDateRangeLabel = () => {
    if (dataDateRange.earliest && dataDateRange.latest) {
      const from = formatDateInt(dataDateRange.earliest);
      const to = formatDateInt(dataDateRange.latest);
      return `${from} - ${to}`;
    }
    return 'Since 2020';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-8 animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-1/4 mb-8"></div>
          <div className="grid grid-cols-3 gap-6">
            <div className="h-20 bg-slate-200 rounded"></div>
            <div className="h-20 bg-slate-200 rounded"></div>
            <div className="h-20 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!filer) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">Candidate not found</p>
      </div>
    );
  }

  return (
    <DatabaseLoader>
      <div className="space-y-6">
        {/* Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{filer.name}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                {filer.type && (
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-800">
                    {filer.type}
                  </span>
                )}
                {filer.party && (
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      filer.party === 'REPUBLICAN'
                        ? 'bg-red-100 text-red-800'
                        : filer.party === 'DEMOCRAT'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {filer.party}
                  </span>
                )}
                {filer.office_held && (
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                    {filer.office_held}
                    {filer.office_district && ` - District ${filer.office_district}`}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Filer ID</p>
              <p className="text-sm font-mono text-slate-700">{filer.id}</p>
            </div>
          </div>

          {/* Date Filter */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-700">Time Period:</span>
              <div className="flex flex-wrap gap-2">
                {(['all', '2024', '2023', '2022', 'custom'] as DatePreset[]).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setDatePreset(preset)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      datePreset === preset
                        ? 'bg-texas-blue text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {preset === 'all' ? 'All Time' : preset === 'custom' ? 'Custom' : preset}
                  </button>
                ))}
              </div>
              {datePreset === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                    className="px-2 py-1 text-sm border border-slate-300 rounded-lg"
                    placeholder="From"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                    className="px-2 py-1 text-sm border border-slate-300 rounded-lg"
                    placeholder="To"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-6 border-t border-slate-200">
            <div>
              <p className="text-sm text-slate-500 mb-1">Total Raised</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(totalContributions)}</p>
              <p className="text-xs text-slate-400 mt-1">{getDateRangeLabel()}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Total Spent</p>
              <p className="text-2xl font-bold text-texas-red">{formatCurrency(totalExpended)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Net (Raised - Spent)</p>
              <p className={`text-2xl font-bold ${cashOnHand >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                {formatCurrency(cashOnHand)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Based on available data</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Contributions</p>
              <p className="text-2xl font-bold text-slate-900">{contributionCount.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6">
          <TopDonorsChart donors={topDonors} />
          <ContributionTimeline data={timelineData} title="Fundraising Timeline" />
        </div>

        {/* Recent Contributions */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Contributions
              {datePreset !== 'all' && (
                <span className="text-sm font-normal text-slate-500 ml-2">
                  ({datePreset === 'custom' ? 'Custom range' : datePreset})
                </span>
              )}
            </h2>
          </div>
          <ResultsTable type="contributions" data={contributions} />
          <div className="p-6 border-t border-slate-200">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(contributionsTotal / pageSize)}
              totalResults={contributionsTotal}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>
    </DatabaseLoader>
  );
}

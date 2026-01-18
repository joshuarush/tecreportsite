import { useState, useEffect } from 'react';
import TopDonorsChart from './TopDonorsChart';
import ContributionTimeline from './ContributionTimeline';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import { getFilerById, getTopDonors, searchContributions, formatCurrency } from '../lib/search';
import type { Filer, Contribution } from '../lib/search';

interface CandidateProfileProps {
  filerId: string;
}

interface ProfileData {
  filer: Filer | null;
  totalContributions: number;
  totalExpended: number;
  contributionCount: number;
}

interface TopDonor {
  name: string;
  total: number;
  count: number;
}

export default function CandidateProfile({ filerId }: CandidateProfileProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [topDonors, setTopDonors] = useState<TopDonor[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributionsTotal, setContributionsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      try {
        const [profileData, donors] = await Promise.all([
          getFilerById(filerId),
          getTopDonors(filerId, 10),
        ]);

        setProfile(profileData);
        setTopDonors(donors);
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [filerId]);

  useEffect(() => {
    async function loadContributions() {
      try {
        const result = await searchContributions(
          { query: undefined }, // Will need to filter by filer_id
          { page: currentPage, pageSize }
        );
        setContributions(result.data);
        setContributionsTotal(result.count);
      } catch (error) {
        console.error('Error loading contributions:', error);
      }
    }

    loadContributions();
  }, [filerId, currentPage]);

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

  if (!profile || !profile.filer) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">Candidate not found</p>
      </div>
    );
  }

  const { filer, totalContributions, totalExpended, contributionCount } = profile;
  const cashOnHand = totalContributions - totalExpended;

  return (
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
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                  filer.party === 'REPUBLICAN' ? 'bg-red-100 text-red-800' :
                  filer.party === 'DEMOCRAT' ? 'bg-blue-100 text-blue-800' :
                  'bg-slate-100 text-slate-800'
                }`}>
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

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 pt-6 border-t border-slate-200">
          <div>
            <p className="text-sm text-slate-500 mb-1">Total Raised</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalContributions)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-1">Total Spent</p>
            <p className="text-2xl font-bold text-texas-red">{formatCurrency(totalExpended)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-1">Cash on Hand</p>
            <p className={`text-2xl font-bold ${cashOnHand >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {formatCurrency(cashOnHand)}
            </p>
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
        <ContributionTimeline data={[]} title="Fundraising Timeline" />
      </div>

      {/* Recent Contributions */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Recent Contributions</h2>
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
  );
}

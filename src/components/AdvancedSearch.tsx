import { useState, useEffect, useCallback } from 'react';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import { query as duckdbQuery, waitForInit, formatCurrency, formatDate, type Contribution, type Expenditure } from '../lib/duckdb';

type TransactionType = 'contributions' | 'expenditures' | 'both';

interface AdvancedFilters {
  // Transaction type
  transactionType: TransactionType;

  // Name search
  name: string;
  nameSearchType: 'contains' | 'exact' | 'starts_with';
  searchRecipient: boolean;

  // Amount range
  amountMin: string;
  amountMax: string;

  // Date range
  dateFrom: string;
  dateTo: string;

  // Geographic filters
  city: string;
  state: string;
  zipCode: string;

  // Contributor details
  employer: string;
  occupation: string;
  contributorType: string;

  // Filer filters
  filerName: string;
  filerType: string;
  officeType: string;
  party: string;
  district: string;

  // Expenditure specific
  expenditureCategory: string;
  payeeName: string;
}

const DEFAULT_FILTERS: AdvancedFilters = {
  transactionType: 'contributions',
  name: '',
  nameSearchType: 'contains',
  searchRecipient: false,
  amountMin: '',
  amountMax: '',
  dateFrom: '',
  dateTo: '',
  city: '',
  state: '',
  zipCode: '',
  employer: '',
  occupation: '',
  contributorType: '',
  filerName: '',
  filerType: '',
  officeType: '',
  party: '',
  district: '',
  expenditureCategory: '',
  payeeName: '',
};

const CONTRIBUTOR_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'ENTITY', label: 'Business/Corporation' },
  { value: 'LAW FIRM', label: 'Law Firm' },
];

const FILER_TYPES = [
  { value: '', label: 'All Filer Types' },
  { value: 'COH', label: 'Candidate/Officeholder' },
  { value: 'GPAC', label: 'General Purpose PAC' },
  { value: 'SPAC', label: 'Specific Purpose PAC' },
  { value: 'MPAC', label: 'Party PAC' },
  { value: 'JCOH', label: 'Judicial Candidate' },
];

const OFFICE_TYPES = [
  { value: '', label: 'All Offices' },
  { value: 'GOVERNOR', label: 'Governor' },
  { value: 'LT_GOVERNOR', label: 'Lieutenant Governor' },
  { value: 'ATTORNEY_GEN', label: 'Attorney General' },
  { value: 'COMPTROLLER', label: 'Comptroller' },
  { value: 'LAND_COMM', label: 'Land Commissioner' },
  { value: 'AG_COMM', label: 'Agriculture Commissioner' },
  { value: 'STATESEN', label: 'State Senator' },
  { value: 'STATEREP', label: 'State Representative' },
  { value: 'JUSTICE_SUP', label: 'Supreme Court Justice' },
  { value: 'JUDGE_CCA', label: 'Court of Criminal Appeals Judge' },
  { value: 'JUDGE_DIST', label: 'District Judge' },
  { value: 'JUDGE_COUNTY', label: 'County Judge' },
  { value: 'DA', label: 'District Attorney' },
  { value: 'COUNTY_COMM', label: 'County Commissioner' },
  { value: 'SHERIFF', label: 'Sheriff' },
  { value: 'MAYOR', label: 'Mayor' },
  { value: 'CITY_COUNCIL', label: 'City Council' },
  { value: 'SCHOOL_BD', label: 'School Board' },
];

const PARTIES = [
  { value: '', label: 'All Parties' },
  { value: 'REPUBLICAN', label: 'Republican' },
  { value: 'DEMOCRAT', label: 'Democrat' },
  { value: 'LIBERTARIAN', label: 'Libertarian' },
  { value: 'GREEN', label: 'Green' },
  { value: 'INDEPENDENT', label: 'Independent' },
];

const STATES = [
  { value: '', label: 'All States' },
  { value: 'TX', label: 'Texas' },
  { value: 'CA', label: 'California' },
  { value: 'NY', label: 'New York' },
  { value: 'FL', label: 'Florida' },
  { value: 'IL', label: 'Illinois' },
  // Add more as needed
];

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

export default function AdvancedSearch() {
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<(Contribution | Expenditure)[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    transaction: true,
    name: true,
    amount: true,
    date: true,
    location: false,
    contributor: false,
    filer: false,
    expenditure: false,
  });
  const pageSize = 50;

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const updateFilter = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setResults([]);
    setTotalCount(0);
    setHasSearched(false);
  };

  const escapeSql = (str: string): string => str.replace(/'/g, "''");

  const dateToInt = (dateStr: string): number => parseInt(dateStr.replace(/-/g, ''), 10);

  const performSearch = useCallback(async () => {
    setLoading(true);
    setHasSearched(true);

    try {
      await waitForInit();

      const { transactionType } = filters;
      const offset = (currentPage - 1) * pageSize;

      if (transactionType === 'contributions' || transactionType === 'both') {
        const conditions: string[] = [];

        // Apply name filter
        if (filters.name) {
          const escapedName = escapeSql(filters.name);
          if (filters.nameSearchType === 'exact') {
            conditions.push(`contributor_name ILIKE '${escapedName}'`);
          } else if (filters.nameSearchType === 'starts_with') {
            conditions.push(`contributor_name ILIKE '${escapedName}%'`);
          } else {
            conditions.push(`contributor_name ILIKE '%${escapedName}%'`);
          }
        }

        // Apply amount filters
        if (filters.amountMin) {
          conditions.push(`amount >= ${parseFloat(filters.amountMin)}`);
        }
        if (filters.amountMax) {
          conditions.push(`amount <= ${parseFloat(filters.amountMax)}`);
        }

        // Apply date filters (convert YYYY-MM-DD to YYYYMMDD integer)
        if (filters.dateFrom) {
          conditions.push(`date >= ${dateToInt(filters.dateFrom)}`);
        }
        if (filters.dateTo) {
          conditions.push(`date <= ${dateToInt(filters.dateTo)}`);
        }

        // Apply location filters
        if (filters.city) {
          conditions.push(`contributor_city ILIKE '%${escapeSql(filters.city)}%'`);
        }
        if (filters.state) {
          conditions.push(`contributor_state = '${escapeSql(filters.state)}'`);
        }

        // Apply contributor filters
        if (filters.employer) {
          conditions.push(`contributor_employer ILIKE '%${escapeSql(filters.employer)}%'`);
        }
        if (filters.occupation) {
          conditions.push(`contributor_occupation ILIKE '%${escapeSql(filters.occupation)}%'`);
        }
        if (filters.contributorType) {
          conditions.push(`contributor_type = '${escapeSql(filters.contributorType)}'`);
        }

        // Apply filer name filter
        if (filters.filerName) {
          conditions.push(`filer_name ILIKE '%${escapeSql(filters.filerName)}%'`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get count
        const countResult = await duckdbQuery<{ count: number }>(`
          SELECT COUNT(*) as count FROM contributions ${whereClause}
        `);
        const count = Number(countResult[0]?.count || 0);

        // Get data
        const data = await duckdbQuery<Contribution>(`
          SELECT * FROM contributions
          ${whereClause}
          ORDER BY date DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `);

        setResults(data || []);
        setTotalCount(count);
      }

      if (transactionType === 'expenditures') {
        const conditions: string[] = [];

        // Apply payee name filter
        if (filters.payeeName || filters.name) {
          const searchName = escapeSql(filters.payeeName || filters.name);
          if (filters.nameSearchType === 'exact') {
            conditions.push(`payee_name ILIKE '${searchName}'`);
          } else if (filters.nameSearchType === 'starts_with') {
            conditions.push(`payee_name ILIKE '${searchName}%'`);
          } else {
            conditions.push(`payee_name ILIKE '%${searchName}%'`);
          }
        }

        // Apply amount filters
        if (filters.amountMin) {
          conditions.push(`amount >= ${parseFloat(filters.amountMin)}`);
        }
        if (filters.amountMax) {
          conditions.push(`amount <= ${parseFloat(filters.amountMax)}`);
        }

        // Apply date filters
        if (filters.dateFrom) {
          conditions.push(`date >= ${dateToInt(filters.dateFrom)}`);
        }
        if (filters.dateTo) {
          conditions.push(`date <= ${dateToInt(filters.dateTo)}`);
        }

        // Apply location filters
        if (filters.city) {
          conditions.push(`payee_city ILIKE '%${escapeSql(filters.city)}%'`);
        }
        if (filters.state) {
          conditions.push(`payee_state = '${escapeSql(filters.state)}'`);
        }

        // Apply category filter
        if (filters.expenditureCategory) {
          conditions.push(`category = '${escapeSql(filters.expenditureCategory)}'`);
        }

        // Apply filer name filter
        if (filters.filerName) {
          conditions.push(`filer_name ILIKE '%${escapeSql(filters.filerName)}%'`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get count
        const countResult = await duckdbQuery<{ count: number }>(`
          SELECT COUNT(*) as count FROM expenditures ${whereClause}
        `);
        const count = Number(countResult[0]?.count || 0);

        // Get data
        const data = await duckdbQuery<Expenditure>(`
          SELECT * FROM expenditures
          ${whereClause}
          ORDER BY date DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `);

        setResults(data || []);
        setTotalCount(count);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage]);

  const handleSearch = () => {
    setCurrentPage(1);
    performSearch();
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  useEffect(() => {
    if (hasSearched && currentPage > 1) {
      performSearch();
    }
  }, [currentPage, hasSearched, performSearch]);

  const handleExportCSV = () => {
    // TODO: Implement CSV export
    alert('CSV export coming soon!');
  };

  const SectionHeader = ({
    title,
    section,
    icon,
  }: {
    title: string;
    section: keyof typeof expandedSections;
    icon: string;
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full px-4 py-3 text-left font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
    >
      <span className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        {title}
      </span>
      <svg
        className={`w-5 h-5 transition-transform ${expandedSections[section] ? 'rotate-180' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-6">
      {/* Filters Panel */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-texas-blue text-white">
            <h2 className="text-lg font-semibold">Advanced Search</h2>
            <p className="text-sm text-blue-200 mt-1">Build complex queries with multiple filters</p>
          </div>

          <div className="p-4 space-y-4">
            {/* Transaction Type */}
            <div>
              <SectionHeader title="Transaction Type" section="transaction" icon="📊" />
              {expandedSections.transaction && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={filters.transactionType === 'contributions'}
                        onChange={() => updateFilter('transactionType', 'contributions')}
                        className="w-4 h-4 text-texas-blue"
                      />
                      <span className="text-sm">Contributions</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={filters.transactionType === 'expenditures'}
                        onChange={() => updateFilter('transactionType', 'expenditures')}
                        className="w-4 h-4 text-texas-blue"
                      />
                      <span className="text-sm">Expenditures</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Name Search */}
            <div>
              <SectionHeader title="Name Search" section="name" icon="👤" />
              {expandedSections.name && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {filters.transactionType === 'expenditures' ? 'Payee Name' : 'Contributor Name'}
                    </label>
                    <input
                      type="text"
                      value={filters.name}
                      onChange={(e) => updateFilter('name', e.target.value)}
                      placeholder="Enter name..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Search Mode</label>
                    <select
                      value={filters.nameSearchType}
                      onChange={(e) => updateFilter('nameSearchType', e.target.value as 'contains' | 'exact' | 'starts_with')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white"
                    >
                      <option value="contains">Contains</option>
                      <option value="exact">Exact Match</option>
                      <option value="starts_with">Starts With</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Amount Range */}
            <div>
              <SectionHeader title="Amount Range" section="amount" icon="💰" />
              {expandedSections.amount && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Min Amount</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={filters.amountMin}
                        onChange={(e) => updateFilter('amountMin', e.target.value)}
                        placeholder="$0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Max Amount</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={filters.amountMax}
                        onChange={(e) => updateFilter('amountMax', e.target.value)}
                        placeholder="No limit"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => { updateFilter('amountMin', '1000'); updateFilter('amountMax', ''); }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      $1,000+
                    </button>
                    <button
                      type="button"
                      onClick={() => { updateFilter('amountMin', '5000'); updateFilter('amountMax', ''); }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      $5,000+
                    </button>
                    <button
                      type="button"
                      onClick={() => { updateFilter('amountMin', '10000'); updateFilter('amountMax', ''); }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      $10,000+
                    </button>
                    <button
                      type="button"
                      onClick={() => { updateFilter('amountMin', '100000'); updateFilter('amountMax', ''); }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      $100,000+
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Date Range */}
            <div>
              <SectionHeader title="Date Range" section="date" icon="📅" />
              {expandedSections.date && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">From Date</label>
                      <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => updateFilter('dateFrom', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
                      <input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => updateFilter('dateTo', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const lastYear = new Date(now.setFullYear(now.getFullYear() - 1));
                        updateFilter('dateFrom', lastYear.toISOString().split('T')[0]);
                        updateFilter('dateTo', new Date().toISOString().split('T')[0]);
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      Last Year
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('dateFrom', '2024-01-01');
                        updateFilter('dateTo', '2024-12-31');
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      2024
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('dateFrom', '2022-01-01');
                        updateFilter('dateTo', '2022-12-31');
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      2022
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('dateFrom', '2020-01-01');
                        updateFilter('dateTo', '2020-12-31');
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      2020
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Location Filters */}
            <div>
              <SectionHeader title="Location" section="location" icon="📍" />
              {expandedSections.location && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                    <input
                      type="text"
                      value={filters.city}
                      onChange={(e) => updateFilter('city', e.target.value)}
                      placeholder="e.g., Austin, Houston"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                    <select
                      value={filters.state}
                      onChange={(e) => updateFilter('state', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white"
                    >
                      {STATES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Contributor Details (for contributions) */}
            {filters.transactionType !== 'expenditures' && (
              <div>
                <SectionHeader title="Contributor Details" section="contributor" icon="🏢" />
                {expandedSections.contributor && (
                  <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Contributor Type</label>
                      <select
                        value={filters.contributorType}
                        onChange={(e) => updateFilter('contributorType', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white"
                      >
                        {CONTRIBUTOR_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Employer</label>
                      <input
                        type="text"
                        value={filters.employer}
                        onChange={(e) => updateFilter('employer', e.target.value)}
                        placeholder="e.g., ExxonMobil, AT&T"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Occupation</label>
                      <input
                        type="text"
                        value={filters.occupation}
                        onChange={(e) => updateFilter('occupation', e.target.value)}
                        placeholder="e.g., Attorney, CEO"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filer (Recipient) Filters */}
            <div>
              <SectionHeader title="Recipient/Filer" section="filer" icon="🏛️" />
              {expandedSections.filer && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filer Name</label>
                    <input
                      type="text"
                      value={filters.filerName}
                      onChange={(e) => updateFilter('filerName', e.target.value)}
                      placeholder="Candidate or committee name"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filer Type</label>
                    <select
                      value={filters.filerType}
                      onChange={(e) => updateFilter('filerType', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white"
                    >
                      {FILER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Office Type</label>
                    <select
                      value={filters.officeType}
                      onChange={(e) => updateFilter('officeType', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white"
                    >
                      {OFFICE_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Party</label>
                    <select
                      value={filters.party}
                      onChange={(e) => updateFilter('party', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white"
                    >
                      {PARTIES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Expenditure-specific filters */}
            {filters.transactionType === 'expenditures' && (
              <div>
                <SectionHeader title="Expenditure Details" section="expenditure" icon="💸" />
                {expandedSections.expenditure && (
                  <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Spending Category</label>
                      <select
                        value={filters.expenditureCategory}
                        onChange={(e) => updateFilter('expenditureCategory', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white"
                      >
                        {EXPENDITURE_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-t border-slate-200 space-y-2">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full py-3 bg-texas-blue text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={clearFilters}
              className="w-full py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        {/* Results Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {!hasSearched
              ? 'Configure your search filters'
              : loading
              ? 'Searching...'
              : `${totalCount.toLocaleString()} results found`}
          </h2>
          {hasSearched && totalCount > 0 && (
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 text-sm font-medium text-texas-blue border border-texas-blue rounded-lg hover:bg-blue-50 transition-colors"
            >
              Export CSV
            </button>
          )}
        </div>

        {/* Results Table */}
        {hasSearched && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <ResultsTable
              type={filters.transactionType === 'expenditures' ? 'expenditures' : 'contributions'}
              data={results as any}
              loading={loading}
            />
          </div>
        )}

        {/* Pagination */}
        {hasSearched && totalCount > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(totalCount / pageSize)}
            totalResults={totalCount}
            pageSize={pageSize}
            onPageChange={handlePageChange}
          />
        )}

        {/* Empty State */}
        {!hasSearched && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-texas-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Build Your Search</h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Use the filters on the left to create complex queries. You can search by name, amount,
              date range, location, employer, and more. Combine multiple filters for precise results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

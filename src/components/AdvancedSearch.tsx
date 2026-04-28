import { useState, useEffect, useCallback } from 'react';
import DataTable, { exportToCSV, type SortState, type Column } from './DataTable';
import DatabaseLoader from './DatabaseLoader';
import { query as duckdbQuery, waitForInit, formatCurrency, formatDate, type Contribution, type Expenditure } from '../lib/duckdb';
import { loadTexasGeo, getCitiesInCounty, getCitiesInRegion, type TexasGeoData } from '../lib/texas-geo';

type TransactionType = 'contributions' | 'expenditures' | 'both';

interface AdvancedFilters {
  transactionType: TransactionType;
  name: string;
  nameSearchType: 'contains' | 'exact' | 'starts_with';
  searchRecipient: boolean;
  amountMin: string;
  amountMax: string;
  dateFrom: string;
  dateTo: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  region: string;
  employer: string;
  occupation: string;
  contributorType: string;
  filerName: string;
  filerType: string;
  officeType: string;
  party: string;
  district: string;
  expenditureCategory: string;
  payeeName: string;
  groupByDonor: boolean;
  minContributions: string;
  minTotalAmount: string;
}

interface AggregatedDonor {
  contributor_name: string;
  num_contributions: number;
  total_amount: number;
  avg_amount: number;
  first_date: number;
  last_date: number;
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
  county: '',
  region: '',
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
  groupByDonor: false,
  minContributions: '',
  minTotalAmount: '',
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
  { value: 'LTGOVERNOR', label: 'Lieutenant Governor' },
  { value: 'ATTYGEN', label: 'Attorney General' },
  { value: 'COMPTROLLER', label: 'Comptroller' },
  { value: 'LANDCOMM', label: 'Land Commissioner' },
  { value: 'AGRICULTUR', label: 'Agriculture Commissioner' },
  { value: 'RRCOMM', label: 'Railroad Commissioner' },
  { value: 'STATESEN', label: 'State Senator' },
  { value: 'STATEREP', label: 'State Representative' },
  { value: 'STATEEDU', label: 'State Board of Education' },
  { value: 'JUSTICE_COA', label: 'Court of Appeals Justice' },
  { value: 'JUDGEDIST', label: 'District Judge' },
  { value: 'DISTATTY', label: 'District Attorney' },
  { value: 'STATE_CHAIR', label: 'State Party Chair' },
  { value: 'PARTYCHAIRCO', label: 'Party County Chair' },
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
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' }, { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' }, { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' }, { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' }, { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' }, { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' }, { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' }, { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' }, { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' }, { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' }, { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' }, { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' },
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

const RESULT_CAP = 5000;

// Valid sort columns for each query type
const CONTRIBUTION_SORT_COLS: Record<string, string> = {
  contributor_name: 'contributor_name',
  filer_name: 'filer_name',
  amount: 'amount',
  date: 'date',
  contributor_city: 'contributor_city',
};

const EXPENDITURE_SORT_COLS: Record<string, string> = {
  filer_name: 'filer_name',
  payee_name: 'payee_name',
  amount: 'amount',
  date: 'date',
  category: 'category',
};

const AGGREGATED_SORT_COLS: Record<string, string> = {
  contributor_name: 'contributor_name',
  num_contributions: 'num_contributions',
  total_amount: 'total_amount',
  avg_amount: 'avg_amount',
  first_date: 'first_date',
};

// Column definitions for DataTable
const CONTRIBUTION_COLUMNS: Column<Contribution>[] = [
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
    render: (row) => <span className="font-medium text-green-700 text-sm">{formatCurrency(row.amount)}</span>,
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

const EXPENDITURE_COLUMNS: Column<Expenditure>[] = [
  {
    key: 'filer_name',
    header: 'Payer',
    render: (row) => (
      <a href={`/candidate?id=${row.filer_id}`} className="text-sm text-texas-blue hover:text-blue-700">
        {row.filer_name || row.filer_id}
      </a>
    ),
  },
  {
    key: 'payee_name',
    header: 'Payee',
    render: (row) => (
      <div>
        <div className="font-medium text-slate-900 text-sm">{row.payee_name || 'Unknown'}</div>
        {row.description && <div className="text-xs text-slate-500 truncate max-w-xs">{row.description}</div>}
      </div>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (row) => <span className="font-medium text-texas-red text-sm">{formatCurrency(row.amount)}</span>,
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => <span className="text-slate-600">{formatDate(row.date)}</span>,
  },
  {
    key: 'category',
    header: 'Category',
    hidden: 'mobile',
    render: (row) => <span className="text-slate-600">{row.category || '—'}</span>,
  },
];

const AGGREGATED_COLUMNS: Column<AggregatedDonor>[] = [
  {
    key: 'contributor_name',
    header: 'Donor Name',
    render: (row) => (
      <a
        href={`/search/contributors?q=${encodeURIComponent(row.contributor_name || '')}`}
        className="font-medium text-texas-blue hover:text-blue-700 text-sm block"
      >
        {row.contributor_name || 'Unknown'}
      </a>
    ),
  },
  {
    key: 'num_contributions',
    header: '# Contributions',
    align: 'right',
    render: (row) => <span className="font-medium text-texas-blue text-sm">{row.num_contributions.toLocaleString()}</span>,
  },
  {
    key: 'total_amount',
    header: 'Total Amount',
    align: 'right',
    render: (row) => <span className="font-medium text-green-700 text-sm">{formatCurrency(row.total_amount)}</span>,
  },
  {
    key: 'avg_amount',
    header: 'Avg Amount',
    align: 'right',
    render: (row) => <span className="text-slate-600">{formatCurrency(row.avg_amount)}</span>,
  },
  {
    key: 'first_date',
    header: 'Date Range',
    hidden: 'mobile',
    render: (row) => <span className="text-slate-600">{formatDate(row.first_date)} - {formatDate(row.last_date)}</span>,
  },
];

export default function AdvancedSearch() {
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<(Contribution | Expenditure)[]>([]);
  const [aggregatedResults, setAggregatedResults] = useState<AggregatedDonor[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [autoSearch, setAutoSearch] = useState(false);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    transaction: true,
    name: true,
    amount: true,
    date: true,
    location: false,
    contributor: false,
    filer: false,
    expenditure: false,
    aggregation: false,
  });
  const [texasGeo, setTexasGeo] = useState<TexasGeoData | null>(null);

  useEffect(() => {
    loadTexasGeo().then(setTexasGeo);
  }, []);

  // Parse URL parameters on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const newFilters = { ...DEFAULT_FILTERS };
    let hasParams = false;
    let needsAggregation = false;
    let needsFiler = false;

    if (params.get('party')) { newFilters.party = params.get('party')!; hasParams = true; needsFiler = true; }
    if (params.get('contributorType')) { newFilters.contributorType = params.get('contributorType')!; hasParams = true; }
    if (params.get('amountMin')) { newFilters.amountMin = params.get('amountMin')!; hasParams = true; }
    if (params.get('amountMax')) { newFilters.amountMax = params.get('amountMax')!; hasParams = true; }
    if (params.get('groupByDonor') === 'true') { newFilters.groupByDonor = true; hasParams = true; needsAggregation = true; }
    if (params.get('minContributions')) { newFilters.minContributions = params.get('minContributions')!; hasParams = true; needsAggregation = true; }
    if (params.get('minTotalAmount')) { newFilters.minTotalAmount = params.get('minTotalAmount')!; hasParams = true; needsAggregation = true; }
    if (params.get('filerType')) { newFilters.filerType = params.get('filerType')!; hasParams = true; needsFiler = true; }
    if (params.get('name')) { newFilters.name = params.get('name')!; hasParams = true; }

    if (hasParams) {
      setFilters(newFilters);
      if (needsAggregation) setExpandedSections(prev => ({ ...prev, aggregation: true }));
      if (needsFiler) setExpandedSections(prev => ({ ...prev, filer: true }));
      setAutoSearch(true);
    }
  }, []);

  useEffect(() => {
    if (autoSearch) {
      setAutoSearch(false);
      const timer = setTimeout(() => {
        setHasSearched(true);
        setLoading(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoSearch]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const updateFilter = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setResults([]);
    setAggregatedResults([]);
    setTotalCount(0);
    setHasSearched(false);
    setSortState(null);
  };

  const escapeSql = (str: string): string => str.replace(/'/g, "''");
  const dateToInt = (dateStr: string): number => parseInt(dateStr.replace(/-/g, ''), 10);


  const performSearch = useCallback(async () => {
    setLoading(true);
    setHasSearched(true);

    try {
      await waitForInit();

      const { transactionType } = filters;

      if (transactionType === 'contributions' || transactionType === 'both') {
        const conditions: string[] = [];
        const needsJoin = filters.party || filters.filerType || filters.officeType;
        const colPrefix = needsJoin ? 'c.' : '';

        if (filters.name) {
          const escapedName = escapeSql(filters.name);
          if (filters.nameSearchType === 'exact') conditions.push(`${colPrefix}contributor_name ILIKE '${escapedName}'`);
          else if (filters.nameSearchType === 'starts_with') conditions.push(`${colPrefix}contributor_name ILIKE '${escapedName}%'`);
          else conditions.push(`${colPrefix}contributor_name ILIKE '%${escapedName}%'`);
        }
        if (filters.amountMin) conditions.push(`${colPrefix}amount >= ${parseFloat(filters.amountMin)}`);
        if (filters.amountMax) conditions.push(`${colPrefix}amount <= ${parseFloat(filters.amountMax)}`);
        if (filters.dateFrom) conditions.push(`${colPrefix}date >= ${dateToInt(filters.dateFrom)}`);
        if (filters.dateTo) conditions.push(`${colPrefix}date <= ${dateToInt(filters.dateTo)}`);
        if (filters.city) conditions.push(`${colPrefix}contributor_city ILIKE '%${escapeSql(filters.city)}%'`);
        if (filters.state) {
          if (filters.state === 'TX') {
            conditions.push(`(${colPrefix}contributor_state = 'TX' OR ${colPrefix}contributor_state = 'TEXAS' OR ${colPrefix}contributor_state ILIKE 'Texas')`);
          } else {
            conditions.push(`${colPrefix}contributor_state = '${escapeSql(filters.state)}'`);
          }
        }
        if (filters.zipCode) conditions.push(`${colPrefix}contributor_zip LIKE '${escapeSql(filters.zipCode)}%'`);
        if (filters.county) {
          const cities = getCitiesInCounty(filters.county);
          if (cities.length > 0) conditions.push(`UPPER(${colPrefix}contributor_city) IN (${cities.map(c => `'${escapeSql(c)}'`).join(', ')})`);
        }
        if (filters.region) {
          const cities = getCitiesInRegion(filters.region);
          if (cities.length > 0) conditions.push(`UPPER(${colPrefix}contributor_city) IN (${cities.map(c => `'${escapeSql(c)}'`).join(', ')})`);
        }
        if (filters.employer) conditions.push(`${colPrefix}contributor_employer ILIKE '%${escapeSql(filters.employer)}%'`);
        if (filters.occupation) conditions.push(`${colPrefix}contributor_occupation ILIKE '%${escapeSql(filters.occupation)}%'`);
        if (filters.contributorType) conditions.push(`${colPrefix}contributor_type = '${escapeSql(filters.contributorType)}'`);
        if (filters.filerName) conditions.push(`${colPrefix}filer_name ILIKE '%${escapeSql(filters.filerName)}%'`);
        if (filters.party) conditions.push(`f.party = '${escapeSql(filters.party)}'`);
        if (filters.filerType) conditions.push(`f.type = '${escapeSql(filters.filerType)}'`);
        if (filters.officeType) conditions.push(`(f.office_sought = '${escapeSql(filters.officeType)}' OR f.office_held = '${escapeSql(filters.officeType)}')`);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const fromClause = needsJoin ? `contributions c JOIN filers f ON c.filer_id = f.id` : `contributions`;

        if (filters.groupByDonor) {
          const havingConditions: string[] = [];
          if (filters.minContributions) havingConditions.push(`COUNT(*) > ${parseInt(filters.minContributions, 10)}`);
          if (filters.minTotalAmount) havingConditions.push(`SUM(${colPrefix}amount) >= ${parseFloat(filters.minTotalAmount)}`);
          const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';

          const countResult = await duckdbQuery<{ count: number }>(`
            SELECT COUNT(*) as count FROM (
              SELECT ${colPrefix}contributor_name
              FROM ${fromClause}
              ${whereClause}
              GROUP BY ${colPrefix}contributor_name
              ${havingClause}
            ) subquery
          `);
          const count = Number(countResult[0]?.count || 0);

          // Build sort for aggregated query
          let orderBy = 'ORDER BY total_amount DESC, num_contributions DESC';
          if (sortState && AGGREGATED_SORT_COLS[sortState.column]) {
            const dir = sortState.direction === 'asc' ? 'ASC' : 'DESC';
            orderBy = `ORDER BY ${AGGREGATED_SORT_COLS[sortState.column]} ${dir}`;
          }

          const data = await duckdbQuery<AggregatedDonor>(`
            SELECT
              ${colPrefix}contributor_name,
              COUNT(*) as num_contributions,
              SUM(${colPrefix}amount) as total_amount,
              AVG(${colPrefix}amount) as avg_amount,
              MIN(${colPrefix}date) as first_date,
              MAX(${colPrefix}date) as last_date
            FROM ${fromClause}
            ${whereClause}
            GROUP BY ${colPrefix}contributor_name
            ${havingClause}
            ${orderBy}
            LIMIT ${RESULT_CAP}
          `);

          setAggregatedResults(data || []);
          setResults([]);
          setTotalCount(count);
        } else {
          setAggregatedResults([]);

          const countResult = await duckdbQuery<{ count: number }>(`
            SELECT COUNT(*) as count FROM ${fromClause} ${whereClause}
          `);
          const count = Number(countResult[0]?.count || 0);

          // Build sort for contributions query
          let orderBy = `ORDER BY ${colPrefix}date DESC`;
          if (sortState && CONTRIBUTION_SORT_COLS[sortState.column]) {
            const dir = sortState.direction === 'asc' ? 'ASC' : 'DESC';
            orderBy = `ORDER BY ${colPrefix}${CONTRIBUTION_SORT_COLS[sortState.column]} ${dir}`;
          }

          const selectCols = needsJoin ? 'c.*' : '*';
          const data = await duckdbQuery<Contribution>(`
            SELECT ${selectCols} FROM ${fromClause}
            ${whereClause}
            ${orderBy}
            LIMIT ${RESULT_CAP}
          `);

          setResults(data || []);
          setTotalCount(count);
        }
      }

      if (transactionType === 'expenditures') {
        const conditions: string[] = [];
        const needsJoin = filters.party || filters.filerType || filters.officeType;
        const colPrefix = needsJoin ? 'e.' : '';

        if (filters.payeeName || filters.name) {
          const searchName = escapeSql(filters.payeeName || filters.name);
          if (filters.nameSearchType === 'exact') conditions.push(`${colPrefix}payee_name ILIKE '${searchName}'`);
          else if (filters.nameSearchType === 'starts_with') conditions.push(`${colPrefix}payee_name ILIKE '${searchName}%'`);
          else conditions.push(`${colPrefix}payee_name ILIKE '%${searchName}%'`);
        }
        if (filters.amountMin) conditions.push(`${colPrefix}amount >= ${parseFloat(filters.amountMin)}`);
        if (filters.amountMax) conditions.push(`${colPrefix}amount <= ${parseFloat(filters.amountMax)}`);
        if (filters.dateFrom) conditions.push(`${colPrefix}date >= ${dateToInt(filters.dateFrom)}`);
        if (filters.dateTo) conditions.push(`${colPrefix}date <= ${dateToInt(filters.dateTo)}`);
        if (filters.city) conditions.push(`${colPrefix}payee_city ILIKE '%${escapeSql(filters.city)}%'`);
        if (filters.state) {
          if (filters.state === 'TX') {
            conditions.push(`(${colPrefix}payee_state = 'TX' OR ${colPrefix}payee_state = 'TEXAS' OR ${colPrefix}payee_state ILIKE 'Texas')`);
          } else {
            conditions.push(`${colPrefix}payee_state = '${escapeSql(filters.state)}'`);
          }
        }
        if (filters.zipCode) conditions.push(`${colPrefix}payee_zip LIKE '${escapeSql(filters.zipCode)}%'`);
        if (filters.county) {
          const cities = getCitiesInCounty(filters.county);
          if (cities.length > 0) conditions.push(`UPPER(${colPrefix}payee_city) IN (${cities.map(c => `'${escapeSql(c)}'`).join(', ')})`);
        }
        if (filters.region) {
          const cities = getCitiesInRegion(filters.region);
          if (cities.length > 0) conditions.push(`UPPER(${colPrefix}payee_city) IN (${cities.map(c => `'${escapeSql(c)}'`).join(', ')})`);
        }
        if (filters.expenditureCategory) conditions.push(`${colPrefix}category = '${escapeSql(filters.expenditureCategory)}'`);
        if (filters.filerName) conditions.push(`${colPrefix}filer_name ILIKE '%${escapeSql(filters.filerName)}%'`);
        if (filters.party) conditions.push(`f.party = '${escapeSql(filters.party)}'`);
        if (filters.filerType) conditions.push(`f.type = '${escapeSql(filters.filerType)}'`);
        if (filters.officeType) conditions.push(`(f.office_sought = '${escapeSql(filters.officeType)}' OR f.office_held = '${escapeSql(filters.officeType)}')`);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const fromClause = needsJoin ? `expenditures e JOIN filers f ON e.filer_id = f.id` : `expenditures`;

        const countResult = await duckdbQuery<{ count: number }>(`
          SELECT COUNT(*) as count FROM ${fromClause} ${whereClause}
        `);
        const count = Number(countResult[0]?.count || 0);

        // Build sort for expenditures query
        let orderBy = `ORDER BY ${colPrefix}date DESC`;
        if (sortState && EXPENDITURE_SORT_COLS[sortState.column]) {
          const dir = sortState.direction === 'asc' ? 'ASC' : 'DESC';
          orderBy = `ORDER BY ${colPrefix}${EXPENDITURE_SORT_COLS[sortState.column]} ${dir}`;
        }

        const selectCols = needsJoin ? 'e.*' : '*';
        const data = await duckdbQuery<Expenditure>(`
          SELECT ${selectCols} FROM ${fromClause}
          ${whereClause}
          ${orderBy}
          LIMIT ${RESULT_CAP}
        `);

        setResults(data || []);
        setTotalCount(count);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, sortState]);

  const handleSearch = () => {
    performSearch();
  };

  // Re-search when sort changes (if we've already searched)
  useEffect(() => {
    if (hasSearched && sortState) {
      performSearch();
    }
  }, [sortState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-search from URL params
  useEffect(() => {
    if (autoSearch && hasSearched) {
      performSearch();
    }
  }, [autoSearch, hasSearched, performSearch]);

  const handleSort = useCallback((sort: SortState) => {
    setSortState(sort);
  }, []);

  const handleExportCSV = useCallback(() => {
    if (filters.groupByDonor && filters.transactionType === 'contributions') {
      exportToCSV(aggregatedResults, AGGREGATED_COLUMNS, `tec-donors-${new Date().toISOString().split('T')[0]}.csv`);
    } else if (filters.transactionType === 'expenditures') {
      exportToCSV(results as Expenditure[], EXPENDITURE_COLUMNS, `tec-expenditures-${new Date().toISOString().split('T')[0]}.csv`);
    } else {
      exportToCSV(results as Contribution[], CONTRIBUTION_COLUMNS, `tec-contributions-${new Date().toISOString().split('T')[0]}.csv`);
    }
  }, [results, aggregatedResults, filters.groupByDonor, filters.transactionType]);

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
    <DatabaseLoader>
    <div className="grid lg:grid-cols-[400px_1fr] gap-6">
      {/* Filters Panel */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-texas-blue text-white">
            <h2 className="text-lg font-semibold">List Builder</h2>
            <p className="text-sm text-blue-200 mt-1">Build targeted lists with multiple filters</p>
          </div>

          <div className="p-4 space-y-4">
            {/* Transaction Type */}
            <div>
              <SectionHeader title="Transaction Type" section="transaction" icon="📊" />
              {expandedSections.transaction && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-1">
                    {(['contributions', 'expenditures'] as TransactionType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          updateFilter('transactionType', type);
                          setSortState(null);
                          setResults([]);
                          setAggregatedResults([]);
                          setTotalCount(0);
                          setHasSearched(false);
                        }}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                          filters.transactionType === type
                            ? 'bg-white text-texas-blue shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {type === 'contributions' ? 'Contributions' : 'Expenditures'}
                      </button>
                    ))}
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
                    <input type="text" value={filters.name} onChange={(e) => updateFilter('name', e.target.value)} placeholder="Enter name..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Search Mode</label>
                    <select value={filters.nameSearchType} onChange={(e) => updateFilter('nameSearchType', e.target.value as 'contains' | 'exact' | 'starts_with')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
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
                      <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={filters.amountMin} onChange={(e) => updateFilter('amountMin', e.target.value)} placeholder="$0" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Max Amount</label>
                      <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={filters.amountMax} onChange={(e) => updateFilter('amountMax', e.target.value)} placeholder="No limit" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => { updateFilter('amountMin', '1000'); updateFilter('amountMax', ''); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">$1,000+</button>
                    <button type="button" onClick={() => { updateFilter('amountMin', '5000'); updateFilter('amountMax', ''); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">$5,000+</button>
                    <button type="button" onClick={() => { updateFilter('amountMin', '10000'); updateFilter('amountMax', ''); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">$10,000+</button>
                    <button type="button" onClick={() => { updateFilter('amountMin', '100000'); updateFilter('amountMax', ''); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">$100,000+</button>
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
                      <input type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
                      <input type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => { const now = new Date(); const lastYear = new Date(now.setFullYear(now.getFullYear() - 1)); updateFilter('dateFrom', lastYear.toISOString().split('T')[0]); updateFilter('dateTo', new Date().toISOString().split('T')[0]); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">Last Year</button>
                    <button type="button" onClick={() => { updateFilter('dateFrom', '2025-01-01'); updateFilter('dateTo', '2025-12-31'); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">2025</button>
                    <button type="button" onClick={() => { updateFilter('dateFrom', '2024-01-01'); updateFilter('dateTo', '2024-12-31'); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">2024</button>
                    <button type="button" onClick={() => { updateFilter('dateFrom', '2022-01-01'); updateFilter('dateTo', '2022-12-31'); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">2022</button>
                    <button type="button" onClick={() => { updateFilter('dateFrom', '2020-01-01'); updateFilter('dateTo', '2020-12-31'); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">2020</button>
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Texas Metro Region</label>
                    <select value={filters.region} onChange={(e) => { updateFilter('region', e.target.value); if (e.target.value) updateFilter('county', ''); }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                      <option value="">All Regions</option>
                      <option value="DFW">Dallas-Fort Worth</option>
                      <option value="Houston">Houston Metro</option>
                      <option value="Austin">Austin Metro</option>
                      <option value="San Antonio">San Antonio Metro</option>
                      <option value="El Paso">El Paso</option>
                      <option value="Rio Grande Valley">Rio Grande Valley</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Texas County</label>
                    <select value={filters.county} onChange={(e) => { updateFilter('county', e.target.value); if (e.target.value) updateFilter('region', ''); }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                      <option value="">All Counties</option>
                      {texasGeo?.counties.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                    <input type="text" value={filters.city} onChange={(e) => updateFilter('city', e.target.value)} placeholder="e.g., Austin, Houston" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ZIP Code</label>
                    <input type="text" value={filters.zipCode} onChange={(e) => updateFilter('zipCode', e.target.value)} placeholder="e.g., 78701, 75201" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                    <p className="text-xs text-slate-400 mt-1">Partial match supported (e.g., "787" for Austin area)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                    <select value={filters.state} onChange={(e) => updateFilter('state', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                      {STATES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                    </select>
                  </div>
                  <p className="text-xs text-slate-400">City/county data from Simplemaps.com (CC-BY 4.0)</p>
                </div>
              )}
            </div>

            {/* Contributor Details */}
            {filters.transactionType !== 'expenditures' && (
              <div>
                <SectionHeader title="Contributor Details" section="contributor" icon="🏢" />
                {expandedSections.contributor && (
                  <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Contributor Type</label>
                      <select value={filters.contributorType} onChange={(e) => updateFilter('contributorType', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                        {CONTRIBUTOR_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Employer</label>
                      <input type="text" value={filters.employer} onChange={(e) => updateFilter('employer', e.target.value)} placeholder="e.g., ExxonMobil, AT&T" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Occupation</label>
                      <input type="text" value={filters.occupation} onChange={(e) => updateFilter('occupation', e.target.value)} placeholder="e.g., Attorney, CEO" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filer Filters */}
            <div>
              <SectionHeader title="Recipient/Filer" section="filer" icon="🏛️" />
              {expandedSections.filer && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filer Name</label>
                    <input type="text" value={filters.filerName} onChange={(e) => updateFilter('filerName', e.target.value)} placeholder="Candidate or committee name" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filer Type</label>
                    <select value={filters.filerType} onChange={(e) => updateFilter('filerType', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                      {FILER_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Office Type</label>
                    <select value={filters.officeType} onChange={(e) => updateFilter('officeType', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                      {OFFICE_TYPES.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Party</label>
                    <select value={filters.party} onChange={(e) => updateFilter('party', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                      {PARTIES.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
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
                      <select value={filters.expenditureCategory} onChange={(e) => updateFilter('expenditureCategory', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue bg-white">
                        {EXPENDITURE_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Aggregation */}
            {filters.transactionType === 'contributions' && (
              <div>
                <SectionHeader title="Group & Aggregate" section="aggregation" icon="📈" />
                {expandedSections.aggregation && (
                  <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={filters.groupByDonor} onChange={(e) => updateFilter('groupByDonor', e.target.checked)} className="w-4 h-4 text-texas-blue rounded" />
                        <span className="text-sm font-medium text-slate-700">Group by Donor</span>
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">Aggregate contributions by donor name to see total amounts and contribution counts.</p>
                    {filters.groupByDonor && (
                      <div className="space-y-3 pt-2 border-t border-slate-200">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Min # of Contributions (more than)</label>
                          <input type="number" value={filters.minContributions} onChange={(e) => updateFilter('minContributions', e.target.value)} placeholder="e.g., 5" min="0" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Min Total Amount</label>
                          <input type="text" inputMode="decimal" value={filters.minTotalAmount} onChange={(e) => updateFilter('minTotalAmount', e.target.value)} placeholder="e.g., 10000" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-texas-blue" />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button type="button" onClick={() => { updateFilter('minContributions', '5'); updateFilter('minTotalAmount', ''); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">5+ donations</button>
                          <button type="button" onClick={() => { updateFilter('minContributions', ''); updateFilter('minTotalAmount', '10000'); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">$10K+ total</button>
                          <button type="button" onClick={() => { updateFilter('minContributions', ''); updateFilter('minTotalAmount', '100000'); }} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded">$100K+ total</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-t border-slate-200 space-y-2">
            <button onClick={handleSearch} disabled={loading} className="w-full py-3 bg-texas-blue text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-50 transition-colors">
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button onClick={clearFilters} className="w-full py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
              Clear All Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        {/* Results Table */}
        {hasSearched && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {filters.groupByDonor && filters.transactionType === 'contributions' ? (
              <DataTable
                columns={AGGREGATED_COLUMNS}
                data={aggregatedResults}
                loading={loading}
                sortState={sortState}
                onSort={handleSort}
                onExportCSV={handleExportCSV}
                rowKey={(row) => row.contributor_name || String(Math.random())}
                totalCount={totalCount}
                resultCap={RESULT_CAP}
                emptyMessage="No donors found matching your criteria. Try adjusting your filters."
              />
            ) : filters.transactionType === 'expenditures' ? (
              <DataTable
                columns={EXPENDITURE_COLUMNS}
                data={results as Expenditure[]}
                loading={loading}
                sortState={sortState}
                onSort={handleSort}
                onExportCSV={handleExportCSV}
                rowKey={(row) => (row as Expenditure).expenditure_id || String(Math.random())}
                totalCount={totalCount}
                resultCap={RESULT_CAP}
                emptyMessage="No expenditures found matching your criteria. Try adjusting your filters."
              />
            ) : (
              <DataTable
                columns={CONTRIBUTION_COLUMNS}
                data={results as Contribution[]}
                loading={loading}
                sortState={sortState}
                onSort={handleSort}
                onExportCSV={handleExportCSV}
                rowKey={(row) => (row as Contribution).contribution_id || String(Math.random())}
                totalCount={totalCount}
                resultCap={RESULT_CAP}
                emptyMessage="No contributions found matching your criteria. Try adjusting your filters."
              />
            )}
          </div>
        )}

        {/* Empty State */}
        {!hasSearched && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-texas-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
    </DatabaseLoader>
  );
}

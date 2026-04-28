import * as duckdb from '@duckdb/duckdb-wasm';
import {
  getCachedFile,
  setCachedFile,
  downloadWithProgress,
  formatBytes,
  isCacheAvailable,
  getCacheInfo,
  clearCache as clearParquetCache,
} from './parquet-cache';
import { buildPartyTagsValuesSql, getAllPartyTags } from './party-tags';

// R2 bucket URL (custom domain with CDN caching)
const R2_BASE = 'https://tec-data.joshuaru.sh';

// Parquet files to load
const PARQUET_FILES = [
  { name: 'filers.parquet', size: 381539 },
  { name: 'reports.parquet', size: 7639590 },
  { name: 'expenditures.parquet', size: 86522293 },
  { name: 'contributions_2020.parquet', size: 209764005 },
] as const;

// Singleton instances
let db: duckdb.AsyncDuckDB | null = null;
let connection: duckdb.AsyncDuckDBConnection | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

// Initialization status tracking
export type InitStatus =
  | 'idle'
  | 'loading-wasm'
  | 'checking-cache'
  | 'downloading'
  | 'loading-data'
  | 'ready'
  | 'error';

export interface InitProgress {
  status: InitStatus;
  error: string | null;
  currentFile?: string;
  fileProgress?: number; // 0-100
  totalProgress?: number; // 0-100
  downloadedBytes?: number;
  totalBytes?: number;
  cached?: boolean;
}

let initProgress: InitProgress = { status: 'idle', error: null };
const progressListeners: Set<(progress: InitProgress) => void> = new Set();

function setProgress(updates: Partial<InitProgress>) {
  initProgress = { ...initProgress, ...updates };
  progressListeners.forEach(listener => listener(initProgress));
}

export function getInitProgress(): InitProgress {
  return { ...initProgress };
}

export function onInitProgressChange(callback: (progress: InitProgress) => void): () => void {
  progressListeners.add(callback);
  callback(initProgress);
  return () => progressListeners.delete(callback);
}

// Legacy status API for compatibility
export type InitStatusLegacy = 'idle' | 'loading-wasm' | 'loading-data' | 'ready' | 'error';
export function getInitStatus(): { status: InitStatusLegacy; error: string | null } {
  const statusMap: Record<InitStatus, InitStatusLegacy> = {
    'idle': 'idle',
    'loading-wasm': 'loading-wasm',
    'checking-cache': 'loading-data',
    'downloading': 'loading-data',
    'loading-data': 'loading-data',
    'ready': 'ready',
    'error': 'error',
  };
  return { status: statusMap[initProgress.status], error: initProgress.error };
}

export function onInitStatusChange(callback: (status: InitStatusLegacy, error?: string) => void): () => void {
  return onInitProgressChange((progress) => {
    const { status, error } = getInitStatus();
    callback(status, error || undefined);
  });
}

// Type definitions
export interface Filer {
  id: string;
  name: string;
  type: string;
  party?: string;
  office_held?: string;
  office_sought?: string;
  district_held?: string;
  district_sought?: string;
  office_district?: string;
  city?: string;
  state?: string;
  status?: string;
}

export interface Contribution {
  contribution_id: string;
  id?: string;
  filer_id: string;
  filer_name?: string;
  contributor_name: string;
  contributor_type?: string;
  contributor_city?: string;
  contributor_state?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  amount: number;
  date: number;
  received_date: number;
  description?: string;
}

export interface Expenditure {
  expenditure_id: string;
  id?: string;
  filer_id: string;
  filer_name?: string;
  payee_name: string;
  payee_city?: string;
  payee_state?: string;
  amount: number;
  date: number;
  received_date: number;
  category?: string;
  category_code?: string;
  description?: string;
}

export interface LedgerTransaction {
  id: string;
  transaction_type: 'contribution' | 'expenditure';
  direction: 'in' | 'out';
  filer_id: string;
  filer_name?: string;
  name: string;
  counterparty_city?: string;
  counterparty_state?: string;
  amount: number;
  date: number;
  received_date: number;
  category?: string;
  description?: string;
}

export interface Report {
  report_id: string;
  filer_id: string;
  filer_name?: string;
  form_type?: string;
  period_start?: number;
  period_end?: number;
  filed_date?: number;
  received_date?: number;
  total_contributions?: number;
  total_expenditures?: number;
  cash_on_hand?: number;
  loan_balance?: number;
}

// Load a parquet file (from cache or download)
async function loadParquetFile(
  fileName: string,
  fileIndex: number,
  totalFiles: number
): Promise<ArrayBuffer> {
  const url = `${R2_BASE}/${fileName}`;

  // Check cache first
  const cached = await getCachedFile(url);
  if (cached) {
    console.log(`Loaded ${fileName} from cache (${formatBytes(cached.byteLength)})`);
    setProgress({
      currentFile: fileName,
      fileProgress: 100,
      totalProgress: Math.round(((fileIndex + 1) / totalFiles) * 100),
      cached: true,
    });
    return cached;
  }

  // Download with progress
  console.log(`Downloading ${fileName}...`);
  setProgress({
    status: 'downloading',
    currentFile: fileName,
    fileProgress: 0,
    cached: false,
  });

  const data = await downloadWithProgress(url, (loaded, total) => {
    const fileProgress = Math.round((loaded / total) * 100);
    const baseProgress = (fileIndex / totalFiles) * 100;
    const fileContribution = (1 / totalFiles) * 100 * (loaded / total);

    setProgress({
      fileProgress,
      totalProgress: Math.round(baseProgress + fileContribution),
      downloadedBytes: loaded,
      totalBytes: total,
    });
  });

  // Cache for next time
  await setCachedFile(url, data);
  console.log(`Downloaded and cached ${fileName} (${formatBytes(data.byteLength)})`);

  return data;
}

// Initialize DuckDB-WASM
async function initDuckDB(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Check if IndexedDB is available
      const cacheAvailable = await isCacheAvailable();
      if (cacheAvailable) {
        const cacheInfo = await getCacheInfo();
        if (cacheInfo.files.length > 0) {
          console.log(`Cache contains ${cacheInfo.files.length} files (${formatBytes(cacheInfo.totalSize)})`);
        }
      }

      setProgress({ status: 'loading-wasm' });
      console.log('Initializing DuckDB-WASM...');

      // Get the bundle from jsDelivr CDN
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      // Create worker
      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
      );
      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger();

      db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      connection = await db.connect();

      setProgress({ status: 'checking-cache' });
      console.log('Loading parquet files...');

      // Load all parquet files (from cache or download)
      const files: Record<string, ArrayBuffer> = {};
      for (let i = 0; i < PARQUET_FILES.length; i++) {
        const file = PARQUET_FILES[i];
        files[file.name] = await loadParquetFile(file.name, i, PARQUET_FILES.length);
      }

      setProgress({ status: 'loading-data', totalProgress: 100 });
      console.log('Registering parquet files with DuckDB...');

      // Register files with DuckDB
      for (const [name, data] of Object.entries(files)) {
        await db.registerFileBuffer(name, new Uint8Array(data));
      }

      const partyTagsValues = await getAllPartyTags()
        .then(buildPartyTagsValuesSql)
        .catch((error) => {
          console.warn('Party tags unavailable during DuckDB initialization:', error);
          return null;
        });

      const partyTagsCte = partyTagsValues
        ? `party_tags(filer_id, party) AS (
          VALUES ${partyTagsValues}
        )`
        : `party_tags(filer_id, party) AS (
          SELECT NULL::VARCHAR AS filer_id, NULL::VARCHAR AS party WHERE false
        )`;

      // Create views with compatibility aliases
      await connection.query(`
        CREATE VIEW IF NOT EXISTS filers AS
        WITH ${partyTagsCte}
        SELECT
          f.* EXCLUDE (party),
          COALESCE(
            CASE
              WHEN f.party IN ('REPUBLICAN', 'DEMOCRAT', 'LIBERTARIAN', 'GREEN', 'INDEPENDENT')
                THEN f.party
              ELSE NULL
            END,
            pt.party
          ) AS party,
          COALESCE(district_held, district_sought) as office_district
        FROM read_parquet('filers.parquet') f
        LEFT JOIN party_tags pt ON f.id = pt.filer_id;
      `);

      await connection.query(`
        CREATE VIEW IF NOT EXISTS contributions AS
        SELECT *,
          contribution_id as id
        FROM read_parquet('contributions_2020.parquet');
      `);

      await connection.query(`
        CREATE VIEW IF NOT EXISTS expenditures AS
        SELECT *,
          expenditure_id as id
        FROM read_parquet('expenditures.parquet');
      `);

      await connection.query(`
        CREATE VIEW IF NOT EXISTS reports AS
        SELECT * FROM read_parquet('reports.parquet');
      `);

      initialized = true;
      setProgress({ status: 'ready' });
      console.log('DuckDB-WASM initialized successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setProgress({ status: 'error', error: message });
      console.error('DuckDB initialization failed:', error);
      throw error;
    }
  })();

  return initPromise;
}

// Execute a query and return results
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  await initDuckDB();
  if (!connection) throw new Error('DuckDB connection not initialized');

  const result = await connection.query(sql);
  return result.toArray().map(row => row.toJSON() as T);
}

// Cache management exports
export { clearParquetCache as clearCache, getCacheInfo };

// Search filters interface
export interface SearchFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  contributorType?: string;
  city?: string;
  state?: string;
  expenditureCategory?: string;
  filerName?: string;
  party?: string;
  officeType?: string;
  district?: string;
  filerId?: string;
  filerType?: string;
}

export interface SortParams {
  column: string;
  direction: 'asc' | 'desc';
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sort?: SortParams;
}

export interface SearchResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function dateToInt(dateStr: string): number {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

export function formatDateInt(dateInt: number): string {
  if (!dateInt) return '';
  const str = dateInt.toString();
  if (str.length !== 8) return str;
  const year = str.slice(0, 4);
  const month = str.slice(4, 6);
  const day = str.slice(6, 8);
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

// Valid sort columns for contributions
const CONTRIBUTION_SORT_COLUMNS: Record<string, string> = {
  contributor_name: 'contributor_name',
  filer_name: 'filer_name',
  amount: 'amount',
  date: 'date',
  contributor_city: 'contributor_city',
};

// Search contributions
export async function searchContributions(
  filters: SearchFilters,
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<SearchResult<Contribution>> {
  await initDuckDB();

  const { page, pageSize, sort } = pagination;
  const offset = (page - 1) * pageSize;
  const conditions: string[] = [];

  if (filters.query) {
    conditions.push(`contributor_name ILIKE '%${escapeSql(filters.query)}%'`);
  }
  if (filters.dateFrom) {
    conditions.push(`date >= ${dateToInt(filters.dateFrom)}`);
  }
  if (filters.dateTo) {
    conditions.push(`date <= ${dateToInt(filters.dateTo)}`);
  }
  if (filters.amountMin !== undefined) {
    conditions.push(`amount >= ${filters.amountMin}`);
  }
  if (filters.amountMax !== undefined) {
    conditions.push(`amount <= ${filters.amountMax}`);
  }
  if (filters.contributorType) {
    conditions.push(`contributor_type = '${escapeSql(filters.contributorType)}'`);
  }
  if (filters.filerId) {
    conditions.push(`filer_id = '${escapeSql(filters.filerId)}'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build ORDER BY clause - validate column name to prevent SQL injection
  let orderBy = 'ORDER BY date DESC';
  if (sort && CONTRIBUTION_SORT_COLUMNS[sort.column]) {
    const col = CONTRIBUTION_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM contributions ${whereClause}
  `);
  const count = Number(countResult[0]?.count || 0);

  const data = await query<Contribution>(`
    SELECT * FROM contributions
    ${whereClause}
    ${orderBy}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return {
    data,
    count,
    page,
    pageSize,
    totalPages: Math.ceil(count / pageSize),
  };
}

// Valid sort columns for filers
const FILER_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  type: 'type',
  office_held: 'office_held',
  party: 'party',
  status: 'status',
};

// Search filers
export async function searchFilers(
  filters: SearchFilters,
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<SearchResult<Filer>> {
  await initDuckDB();

  const { page, pageSize, sort } = pagination;
  const offset = (page - 1) * pageSize;
  const conditions: string[] = [];

  if (filters.query) {
    conditions.push(`name ILIKE '%${escapeSql(filters.query)}%'`);
  }
  if (filters.party) {
    conditions.push(`party = '${escapeSql(filters.party)}'`);
  }
  if (filters.officeType) {
    conditions.push(`(office_held = '${escapeSql(filters.officeType)}' OR office_sought = '${escapeSql(filters.officeType)}')`);
  }
  if (filters.district) {
    conditions.push(`(district_held = '${escapeSql(filters.district)}' OR district_sought = '${escapeSql(filters.district)}')`);
  }
  if (filters.filerType) {
    conditions.push(`type = '${escapeSql(filters.filerType)}'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build ORDER BY clause
  let orderBy = 'ORDER BY name ASC';
  if (sort && FILER_SORT_COLUMNS[sort.column]) {
    const col = FILER_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM filers ${whereClause}
  `);
  const count = Number(countResult[0]?.count || 0);

  const data = await query<Filer>(`
    SELECT * FROM filers
    ${whereClause}
    ${orderBy}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return {
    data,
    count,
    page,
    pageSize,
    totalPages: Math.ceil(count / pageSize),
  };
}

// Valid sort columns for expenditures
const EXPENDITURE_SORT_COLUMNS: Record<string, string> = {
  filer_name: 'filer_name',
  payee_name: 'payee_name',
  amount: 'amount',
  date: 'date',
  category: 'category',
};

const LEDGER_SORT_COLUMNS: Record<string, string> = {
  date: 'date',
  direction: 'direction',
  name: 'name',
  filer_name: 'filer_name',
  amount: 'amount',
  description: 'description',
};

// Search expenditures
export async function searchExpenditures(
  filters: SearchFilters,
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<SearchResult<Expenditure>> {
  await initDuckDB();

  const { page, pageSize, sort } = pagination;
  const offset = (page - 1) * pageSize;
  const conditions: string[] = [];

  if (filters.query) {
    conditions.push(`payee_name ILIKE '%${escapeSql(filters.query)}%'`);
  }
  if (filters.dateFrom) {
    conditions.push(`date >= ${dateToInt(filters.dateFrom)}`);
  }
  if (filters.dateTo) {
    conditions.push(`date <= ${dateToInt(filters.dateTo)}`);
  }
  if (filters.amountMin !== undefined) {
    conditions.push(`amount >= ${filters.amountMin}`);
  }
  if (filters.amountMax !== undefined) {
    conditions.push(`amount <= ${filters.amountMax}`);
  }
  if (filters.filerId) {
    conditions.push(`filer_id = '${escapeSql(filters.filerId)}'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build ORDER BY clause
  let orderBy = 'ORDER BY date DESC';
  if (sort && EXPENDITURE_SORT_COLUMNS[sort.column]) {
    const col = EXPENDITURE_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM expenditures ${whereClause}
  `);
  const count = Number(countResult[0]?.count || 0);

  const data = await query<Expenditure>(`
    SELECT * FROM expenditures
    ${whereClause}
    ${orderBy}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return {
    data,
    count,
    page,
    pageSize,
    totalPages: Math.ceil(count / pageSize),
  };
}

// Latest report data for a filer
export interface LatestReport {
  reportId: number;
  formType: string;
  periodStart: string;
  periodEnd: string;
  filedDate: number;
  totalContributions: number;
  totalExpenditures: number;
  cashOnHand: number | null;
  loanBalance: number | null;
}

// Get the most recent report for a filer
export async function getLatestReport(filerId: string): Promise<LatestReport | null> {
  await initDuckDB();

  const results = await query<{
    report_id: number;
    form_type: string;
    period_start: string;
    period_end: string;
    filed_date: number;
    total_contributions: number;
    total_expenditures: number;
    cash_on_hand: number | null;
    loan_balance: number | null;
  }>(`
    SELECT report_id, form_type, period_start, period_end, filed_date,
           total_contributions, total_expenditures, cash_on_hand, loan_balance
    FROM reports
    WHERE filer_id = '${escapeSql(filerId)}'
    ORDER BY period_end DESC, filed_date DESC
    LIMIT 1
  `);

  if (results.length === 0) return null;

  const r = results[0];
  return {
    reportId: r.report_id,
    formType: r.form_type || '',
    periodStart: r.period_start || '',
    periodEnd: r.period_end || '',
    filedDate: r.filed_date || 0,
    totalContributions: Number(r.total_contributions || 0),
    totalExpenditures: Number(r.total_expenditures || 0),
    cashOnHand: r.cash_on_hand != null ? Number(r.cash_on_hand) : null,
    loanBalance: r.loan_balance != null ? Number(r.loan_balance) : null,
  };
}

// Get filer by ID with stats
export async function getFilerById(filerId: string): Promise<{
  filer: Filer | null;
  totalContributions: number;
  totalExpended: number;
  contributionCount: number;
} | null> {
  await initDuckDB();

  const filers = await query<Filer>(`
    SELECT * FROM filers WHERE id = '${escapeSql(filerId)}' LIMIT 1
  `);

  if (filers.length === 0) return null;

  const filer = filers[0];

  const contribStats = await query<{ total: number; count: number }>(`
    SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM contributions
    WHERE filer_id = '${escapeSql(filerId)}'
  `);

  const expendStats = await query<{ total: number }>(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenditures
    WHERE filer_id = '${escapeSql(filerId)}'
  `);

  return {
    filer,
    totalContributions: Number(contribStats[0]?.total || 0),
    totalExpended: Number(expendStats[0]?.total || 0),
    contributionCount: Number(contribStats[0]?.count || 0),
  };
}

// Get top donors for a filer
export async function getTopDonors(
  filerId: string,
  limit: number = 10
): Promise<{ name: string; total: number; count: number }[]> {
  await initDuckDB();

  const results = await query<{ name: string; total: number; count: number }>(`
    SELECT
      COALESCE(contributor_name, 'Unknown') as name,
      SUM(amount) as total,
      COUNT(*) as count
    FROM contributions
    WHERE filer_id = '${escapeSql(filerId)}'
    GROUP BY contributor_name
    ORDER BY total DESC
    LIMIT ${limit}
  `);

  return results.map(r => ({
    name: r.name,
    total: Number(r.total),
    count: Number(r.count),
  }));
}

// Get contributions for a filer
export async function getContributionsForFiler(
  filerId: string,
  limit: number = 100
): Promise<Contribution[]> {
  await initDuckDB();

  return query<Contribution>(`
    SELECT * FROM contributions
    WHERE filer_id = '${escapeSql(filerId)}'
    ORDER BY date DESC
    LIMIT ${limit}
  `);
}

// Format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format date
export function formatDate(dateVal: string | number): string {
  if (!dateVal) return '';

  if (typeof dateVal === 'number' || /^\d{8}$/.test(dateVal.toString())) {
    return formatDateInt(Number(dateVal));
  }

  const date = new Date(dateVal);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Get timeline data for a filer (monthly aggregations)
export interface TimelineDataPoint {
  date: string;
  contributions: number;
  expenditures: number;
  cumulativeContributions: number;
  cumulativeExpenditures: number;
  cashOnHand: number;
}

export async function getTimelineData(
  filerId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<TimelineDataPoint[]> {
  await initDuckDB();

  const dateConditions: string[] = [];
  if (dateFrom) dateConditions.push(`date >= ${dateToInt(dateFrom)}`);
  if (dateTo) dateConditions.push(`date <= ${dateToInt(dateTo)}`);
  const dateWhere = dateConditions.length > 0 ? ` AND ${dateConditions.join(' AND ')}` : '';

  // Get monthly contributions
  const contribResults = await query<{ month: string; total: number }>(`
    SELECT
      strftime(
        make_date(
          CAST(FLOOR(date / 10000) AS INTEGER),
          CAST(FLOOR((date % 10000) / 100) AS INTEGER),
          1
        ),
        '%Y-%m-01'
      ) as month,
      SUM(amount) as total
    FROM contributions
    WHERE filer_id = '${escapeSql(filerId)}'${dateWhere}
    GROUP BY month
    ORDER BY month
  `);

  // Get monthly expenditures
  const expendResults = await query<{ month: string; total: number }>(`
    SELECT
      strftime(
        make_date(
          CAST(FLOOR(date / 10000) AS INTEGER),
          CAST(FLOOR((date % 10000) / 100) AS INTEGER),
          1
        ),
        '%Y-%m-01'
      ) as month,
      SUM(amount) as total
    FROM expenditures
    WHERE filer_id = '${escapeSql(filerId)}'${dateWhere}
    GROUP BY month
    ORDER BY month
  `);

  // Merge into timeline
  const contribMap = new Map(contribResults.map(r => [r.month, Number(r.total)]));
  const expendMap = new Map(expendResults.map(r => [r.month, Number(r.total)]));

  // Get all months
  const allMonths = new Set([...contribMap.keys(), ...expendMap.keys()]);
  const sortedMonths = Array.from(allMonths).sort();

  let cumulativeContrib = 0;
  let cumulativeExpend = 0;

  return sortedMonths.map(month => {
    const contributions = contribMap.get(month) || 0;
    const expenditures = expendMap.get(month) || 0;
    cumulativeContrib += contributions;
    cumulativeExpend += expenditures;

    return {
      date: month,
      contributions,
      expenditures,
      cumulativeContributions: cumulativeContrib,
      cumulativeExpenditures: cumulativeExpend,
      cashOnHand: cumulativeContrib - cumulativeExpend,
    };
  });
}

// Report-based timeline (uses actual reported totals and COH)
export interface ReportTimelinePoint {
  date: string;
  periodStart: string;
  periodEnd: string;
  contributions: number;
  expenditures: number;
  cashOnHand: number | null;
  loanBalance: number | null;
}

export async function getReportTimeline(
  filerId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<ReportTimelinePoint[]> {
  await initDuckDB();

  const conditions = [`filer_id = '${escapeSql(filerId)}'`];
  if (dateFrom) {
    const fromInt = dateToInt(dateFrom);
    conditions.push(`CAST(period_end AS INTEGER) >= ${fromInt}`);
  }
  if (dateTo) {
    const toInt = dateToInt(dateTo);
    conditions.push(`CAST(period_end AS INTEGER) <= ${toInt}`);
  }

  const results = await query<{
    period_start: string;
    period_end: string;
    total_contributions: number;
    total_expenditures: number;
    cash_on_hand: number | null;
    loan_balance: number | null;
  }>(`
    SELECT period_start, period_end, total_contributions, total_expenditures,
           cash_on_hand, loan_balance
    FROM reports
    WHERE ${conditions.join(' AND ')}
    ORDER BY period_end ASC
  `);

  return results.map(r => ({
    date: r.period_end || '',
    periodStart: r.period_start || '',
    periodEnd: r.period_end || '',
    contributions: Number(r.total_contributions || 0),
    expenditures: Number(r.total_expenditures || 0),
    cashOnHand: r.cash_on_hand != null ? Number(r.cash_on_hand) : null,
    loanBalance: r.loan_balance != null ? Number(r.loan_balance) : null,
  }));
}

// Get top donors with date filtering
export async function getTopDonorsFiltered(
  filerId: string,
  limit: number = 10,
  dateFrom?: string,
  dateTo?: string
): Promise<{ name: string; total: number; count: number }[]> {
  await initDuckDB();

  const conditions = [`filer_id = '${escapeSql(filerId)}'`];
  if (dateFrom) conditions.push(`date >= ${dateToInt(dateFrom)}`);
  if (dateTo) conditions.push(`date <= ${dateToInt(dateTo)}`);

  const results = await query<{ name: string; total: number; count: number }>(`
    SELECT
      COALESCE(contributor_name, 'Unknown') as name,
      SUM(amount) as total,
      COUNT(*) as count
    FROM contributions
    WHERE ${conditions.join(' AND ')}
    GROUP BY contributor_name
    ORDER BY total DESC
    LIMIT ${limit}
  `);

  return results.map(r => ({
    name: r.name,
    total: Number(r.total),
    count: Number(r.count),
  }));
}

// Get filer stats with date filtering
export async function getFilerStatsFiltered(
  filerId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{
  totalContributions: number;
  totalExpended: number;
  contributionCount: number;
  expenditureCount: number;
  dateRange: { earliest: number | null; latest: number | null };
}> {
  await initDuckDB();

  const conditions = [`filer_id = '${escapeSql(filerId)}'`];
  if (dateFrom) conditions.push(`date >= ${dateToInt(dateFrom)}`);
  if (dateTo) conditions.push(`date <= ${dateToInt(dateTo)}`);
  const whereClause = conditions.join(' AND ');

  const contribStats = await query<{ total: number; count: number; earliest: number; latest: number }>(`
    SELECT
      COALESCE(SUM(amount), 0) as total,
      COUNT(*) as count,
      MIN(date) as earliest,
      MAX(date) as latest
    FROM contributions
    WHERE ${whereClause}
  `);

  const expendStats = await query<{ total: number; count: number; earliest: number; latest: number }>(`
    SELECT
      COALESCE(SUM(amount), 0) as total,
      COUNT(*) as count,
      MIN(date) as earliest,
      MAX(date) as latest
    FROM expenditures
    WHERE ${whereClause}
  `);

  const earliestDates = [contribStats[0]?.earliest, expendStats[0]?.earliest].filter(Boolean);
  const latestDates = [contribStats[0]?.latest, expendStats[0]?.latest].filter(Boolean);

  return {
    totalContributions: Number(contribStats[0]?.total || 0),
    totalExpended: Number(expendStats[0]?.total || 0),
    contributionCount: Number(contribStats[0]?.count || 0),
    expenditureCount: Number(expendStats[0]?.count || 0),
    dateRange: {
      earliest: earliestDates.length > 0 ? Math.min(...earliestDates.map(Number)) : null,
      latest: latestDates.length > 0 ? Math.max(...latestDates.map(Number)) : null,
    },
  };
}

// ============================================
// UNPAGINATED SEARCH FUNCTIONS
// Return full result sets with SQL-level sorting
// ============================================

export interface FullSearchResult<T> {
  data: T[];
  totalCount: number;
  capped: boolean;
}

const DEFAULT_RESULT_CAP = 5000;

// Search contributions — full result set with SQL sorting
export async function searchContributionsFull(
  filters: SearchFilters,
  sort?: SortParams,
  cap: number = DEFAULT_RESULT_CAP
): Promise<FullSearchResult<Contribution>> {
  await initDuckDB();

  const conditions: string[] = [];

  if (filters.query) {
    conditions.push(`contributor_name ILIKE '%${escapeSql(filters.query)}%'`);
  }
  if (filters.dateFrom) {
    conditions.push(`date >= ${dateToInt(filters.dateFrom)}`);
  }
  if (filters.dateTo) {
    conditions.push(`date <= ${dateToInt(filters.dateTo)}`);
  }
  if (filters.amountMin !== undefined) {
    conditions.push(`amount >= ${filters.amountMin}`);
  }
  if (filters.amountMax !== undefined) {
    conditions.push(`amount <= ${filters.amountMax}`);
  }
  if (filters.contributorType) {
    conditions.push(`contributor_type = '${escapeSql(filters.contributorType)}'`);
  }
  if (filters.filerId) {
    conditions.push(`filer_id = '${escapeSql(filters.filerId)}'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBy = 'ORDER BY date DESC';
  if (sort && CONTRIBUTION_SORT_COLUMNS[sort.column]) {
    const col = CONTRIBUTION_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM contributions ${whereClause}
  `);
  const totalCount = Number(countResult[0]?.count || 0);

  const data = await query<Contribution>(`
    SELECT * FROM contributions
    ${whereClause}
    ${orderBy}
    LIMIT ${cap}
  `);

  return { data, totalCount, capped: totalCount > cap };
}

// Search filers — full result set with SQL sorting
export async function searchFilersFull(
  filters: SearchFilters,
  sort?: SortParams,
  cap: number = DEFAULT_RESULT_CAP
): Promise<FullSearchResult<Filer>> {
  await initDuckDB();

  const conditions: string[] = [];

  if (filters.query) {
    conditions.push(`name ILIKE '%${escapeSql(filters.query)}%'`);
  }
  if (filters.party) {
    conditions.push(`party = '${escapeSql(filters.party)}'`);
  }
  if (filters.officeType) {
    conditions.push(`(office_held = '${escapeSql(filters.officeType)}' OR office_sought = '${escapeSql(filters.officeType)}')`);
  }
  if (filters.district) {
    conditions.push(`(district_held = '${escapeSql(filters.district)}' OR district_sought = '${escapeSql(filters.district)}')`);
  }
  if (filters.filerType) {
    conditions.push(`type = '${escapeSql(filters.filerType)}'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBy = 'ORDER BY name ASC';
  if (sort && FILER_SORT_COLUMNS[sort.column]) {
    const col = FILER_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM filers ${whereClause}
  `);
  const totalCount = Number(countResult[0]?.count || 0);

  const data = await query<Filer>(`
    SELECT * FROM filers
    ${whereClause}
    ${orderBy}
    LIMIT ${cap}
  `);

  return { data, totalCount, capped: totalCount > cap };
}

// Search expenditures — full result set with SQL sorting
export async function searchExpendituresFull(
  filters: SearchFilters,
  sort?: SortParams,
  cap: number = DEFAULT_RESULT_CAP
): Promise<FullSearchResult<Expenditure>> {
  await initDuckDB();

  const conditions: string[] = [];
  const needsJoin = filters.party || filters.filerType || filters.officeType || filters.district;
  const colPrefix = needsJoin ? 'e.' : '';

  if (filters.query) {
    conditions.push(`${colPrefix}payee_name ILIKE '%${escapeSql(filters.query)}%'`);
  }
  if (filters.dateFrom) {
    conditions.push(`${colPrefix}date >= ${dateToInt(filters.dateFrom)}`);
  }
  if (filters.dateTo) {
    conditions.push(`${colPrefix}date <= ${dateToInt(filters.dateTo)}`);
  }
  if (filters.amountMin !== undefined) {
    conditions.push(`${colPrefix}amount >= ${filters.amountMin}`);
  }
  if (filters.amountMax !== undefined) {
    conditions.push(`${colPrefix}amount <= ${filters.amountMax}`);
  }
  if (filters.filerId) {
    conditions.push(`${colPrefix}filer_id = '${escapeSql(filters.filerId)}'`);
  }
  if (filters.filerName) {
    conditions.push(`${colPrefix}filer_name ILIKE '%${escapeSql(filters.filerName)}%'`);
  }
  if (filters.city) {
    conditions.push(`${colPrefix}payee_city ILIKE '%${escapeSql(filters.city)}%'`);
  }
  if (filters.state) {
    if (filters.state === 'TX') {
      conditions.push(`(${colPrefix}payee_state = 'TX' OR ${colPrefix}payee_state = 'TEXAS' OR ${colPrefix}payee_state ILIKE 'Texas')`);
    } else {
      conditions.push(`${colPrefix}payee_state = '${escapeSql(filters.state)}'`);
    }
  }
  if (filters.expenditureCategory) {
    conditions.push(`(${colPrefix}category = '${escapeSql(filters.expenditureCategory)}' OR ${colPrefix}category_code = '${escapeSql(filters.expenditureCategory)}')`);
  }
  if (filters.party) {
    conditions.push(`f.party = '${escapeSql(filters.party)}'`);
  }
  if (filters.filerType) {
    conditions.push(`f.type = '${escapeSql(filters.filerType)}'`);
  }
  if (filters.officeType) {
    conditions.push(`(f.office_held = '${escapeSql(filters.officeType)}' OR f.office_sought = '${escapeSql(filters.officeType)}')`);
  }
  if (filters.district) {
    conditions.push(`(f.district_held = '${escapeSql(filters.district)}' OR f.district_sought = '${escapeSql(filters.district)}')`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const fromClause = needsJoin ? `expenditures e JOIN filers f ON e.filer_id = f.id` : 'expenditures';
  const selectCols = needsJoin ? 'e.*' : '*';

  let orderBy = 'ORDER BY date DESC';
  if (sort && EXPENDITURE_SORT_COLUMNS[sort.column]) {
    const col = EXPENDITURE_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${colPrefix}${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM ${fromClause} ${whereClause}
  `);
  const totalCount = Number(countResult[0]?.count || 0);

  const data = await query<Expenditure>(`
    SELECT ${selectCols} FROM ${fromClause}
    ${whereClause}
    ${orderBy}
    LIMIT ${cap}
  `);

  return { data, totalCount, capped: totalCount > cap };
}

// Get contributions for a filer — full result set with SQL sorting
export async function getContributionsForFilerFull(
  filerId: string,
  sort?: SortParams,
  dateFrom?: string,
  dateTo?: string,
  cap: number = DEFAULT_RESULT_CAP
): Promise<FullSearchResult<Contribution>> {
  await initDuckDB();

  const conditions = [`filer_id = '${escapeSql(filerId)}'`];
  if (dateFrom) conditions.push(`date >= ${dateToInt(dateFrom)}`);
  if (dateTo) conditions.push(`date <= ${dateToInt(dateTo)}`);
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  let orderBy = 'ORDER BY date DESC';
  if (sort && CONTRIBUTION_SORT_COLUMNS[sort.column]) {
    const col = CONTRIBUTION_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM contributions ${whereClause}
  `);
  const totalCount = Number(countResult[0]?.count || 0);

  const data = await query<Contribution>(`
    SELECT * FROM contributions
    ${whereClause}
    ${orderBy}
    LIMIT ${cap}
  `);

  return { data, totalCount, capped: totalCount > cap };
}

export async function getExpendituresForFilerFull(
  filerId: string,
  sort?: SortParams,
  dateFrom?: string,
  dateTo?: string,
  cap: number = DEFAULT_RESULT_CAP
): Promise<FullSearchResult<Expenditure>> {
  await initDuckDB();

  const conditions = [`filer_id = '${escapeSql(filerId)}'`];
  if (dateFrom) conditions.push(`date >= ${dateToInt(dateFrom)}`);
  if (dateTo) conditions.push(`date <= ${dateToInt(dateTo)}`);
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  let orderBy = 'ORDER BY date DESC';
  if (sort && EXPENDITURE_SORT_COLUMNS[sort.column]) {
    const col = EXPENDITURE_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM expenditures ${whereClause}
  `);
  const totalCount = Number(countResult[0]?.count || 0);

  const data = await query<Expenditure>(`
    SELECT * FROM expenditures
    ${whereClause}
    ${orderBy}
    LIMIT ${cap}
  `);

  return { data, totalCount, capped: totalCount > cap };
}

export async function getLedgerForFilerFull(
  filerId: string,
  sort?: SortParams,
  dateFrom?: string,
  dateTo?: string,
  cap: number = DEFAULT_RESULT_CAP
): Promise<FullSearchResult<LedgerTransaction>> {
  await initDuckDB();

  const contributionConditions = [`filer_id = '${escapeSql(filerId)}'`];
  const expenditureConditions = [`filer_id = '${escapeSql(filerId)}'`];
  if (dateFrom) {
    const fromInt = dateToInt(dateFrom);
    contributionConditions.push(`date >= ${fromInt}`);
    expenditureConditions.push(`date >= ${fromInt}`);
  }
  if (dateTo) {
    const toInt = dateToInt(dateTo);
    contributionConditions.push(`date <= ${toInt}`);
    expenditureConditions.push(`date <= ${toInt}`);
  }

  const contributionWhere = contributionConditions.join(' AND ');
  const expenditureWhere = expenditureConditions.join(' AND ');

  const ledgerSql = `
    SELECT
      CAST(contribution_id AS VARCHAR) as id,
      'contribution' as transaction_type,
      'in' as direction,
      filer_id,
      filer_name,
      COALESCE(contributor_name, 'Unknown') as name,
      contributor_city as counterparty_city,
      contributor_state as counterparty_state,
      amount,
      date,
      received_date,
      NULL as category,
      description
    FROM contributions
    WHERE ${contributionWhere}
    UNION ALL
    SELECT
      CAST(expenditure_id AS VARCHAR) as id,
      'expenditure' as transaction_type,
      'out' as direction,
      filer_id,
      filer_name,
      COALESCE(payee_name, 'Unknown') as name,
      payee_city as counterparty_city,
      payee_state as counterparty_state,
      amount,
      date,
      received_date,
      COALESCE(category, category_code) as category,
      description
    FROM expenditures
    WHERE ${expenditureWhere}
  `;

  let orderBy = 'ORDER BY date DESC';
  if (sort && LEDGER_SORT_COLUMNS[sort.column]) {
    const col = LEDGER_SORT_COLUMNS[sort.column];
    const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = `ORDER BY ${col} ${dir}`;
  }

  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM (${ledgerSql}) ledger
  `);
  const totalCount = Number(countResult[0]?.count || 0);

  const data = await query<LedgerTransaction>(`
    SELECT * FROM (${ledgerSql}) ledger
    ${orderBy}
    LIMIT ${cap}
  `);

  return { data, totalCount, capped: totalCount > cap };
}

export function isDuckDBReady(): boolean {
  return initialized;
}

export async function waitForInit(): Promise<void> {
  await initDuckDB();
}

import * as duckdb from '@duckdb/duckdb-wasm';

// R2 bucket URL
const R2_BASE = 'https://pub-2faac7f0bea6427997fbef200382b3a2.r2.dev';

// Singleton instances
let db: duckdb.AsyncDuckDB | null = null;
let connection: duckdb.AsyncDuckDBConnection | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

// Type definitions matching the existing interface
export interface Filer {
  id: string;
  name: string;
  type: string;
  party?: string;
  office_held?: string;
  office_sought?: string;
  district_held?: string;
  district_sought?: string;
  // Alias for compatibility
  office_district?: string;
  city?: string;
  state?: string;
  status?: string;
}

export interface Contribution {
  contribution_id: string;
  // Alias for compatibility
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
  date: number; // YYYYMMDD format
  received_date: number;
  description?: string;
}

export interface Expenditure {
  expenditure_id: string;
  // Alias for compatibility
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

// Initialize DuckDB-WASM
async function initDuckDB(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
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

    // Enable httpfs for remote parquet files
    await connection.query(`INSTALL httpfs; LOAD httpfs;`);

    // Create views for the remote parquet files with compatibility aliases
    await connection.query(`
      CREATE VIEW IF NOT EXISTS filers AS
      SELECT *,
        COALESCE(district_held, district_sought) as office_district
      FROM read_parquet('${R2_BASE}/filers.parquet');
    `);

    await connection.query(`
      CREATE VIEW IF NOT EXISTS contributions AS
      SELECT *,
        contribution_id as id
      FROM read_parquet('${R2_BASE}/contributions_2020.parquet');
    `);

    await connection.query(`
      CREATE VIEW IF NOT EXISTS expenditures AS
      SELECT *,
        expenditure_id as id
      FROM read_parquet('${R2_BASE}/expenditures.parquet');
    `);

    await connection.query(`
      CREATE VIEW IF NOT EXISTS reports AS
      SELECT * FROM read_parquet('${R2_BASE}/reports.parquet');
    `);

    initialized = true;
    console.log('DuckDB-WASM initialized successfully');
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

// Search filters interface
export interface SearchFilters {
  query?: string;
  dateFrom?: string; // YYYY-MM-DD format
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  contributorType?: string;
  party?: string;
  officeType?: string;
  district?: string;
  filerId?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface SearchResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Convert YYYY-MM-DD to YYYYMMDD integer
function dateToInt(dateStr: string): number {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

// Convert YYYYMMDD integer to display string
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

// Escape string for SQL LIKE pattern
function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

// Search contributions
export async function searchContributions(
  filters: SearchFilters,
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<SearchResult<Contribution>> {
  await initDuckDB();

  const { page, pageSize } = pagination;
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

  // Get count
  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM contributions ${whereClause}
  `);
  const count = Number(countResult[0]?.count || 0);

  // Get data
  const data = await query<Contribution>(`
    SELECT * FROM contributions
    ${whereClause}
    ORDER BY date DESC
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

// Search filers
export async function searchFilers(
  filters: SearchFilters,
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<SearchResult<Filer>> {
  await initDuckDB();

  const { page, pageSize } = pagination;
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get count
  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM filers ${whereClause}
  `);
  const count = Number(countResult[0]?.count || 0);

  // Get data
  const data = await query<Filer>(`
    SELECT * FROM filers
    ${whereClause}
    ORDER BY name ASC
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

// Search expenditures
export async function searchExpenditures(
  filters: SearchFilters,
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<SearchResult<Expenditure>> {
  await initDuckDB();

  const { page, pageSize } = pagination;
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

  // Get count
  const countResult = await query<{ count: number }>(`
    SELECT COUNT(*) as count FROM expenditures ${whereClause}
  `);
  const count = Number(countResult[0]?.count || 0);

  // Get data
  const data = await query<Expenditure>(`
    SELECT * FROM expenditures
    ${whereClause}
    ORDER BY date DESC
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

  // Get contribution stats
  const contribStats = await query<{ total: number; count: number }>(`
    SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM contributions
    WHERE filer_id = '${escapeSql(filerId)}'
  `);

  // Get expenditure stats
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

// Get contributions for a filer (for timeline)
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

// Format date from YYYYMMDD integer or date string
export function formatDate(dateVal: string | number): string {
  if (!dateVal) return '';

  // Handle YYYYMMDD integer format
  if (typeof dateVal === 'number' || /^\d{8}$/.test(dateVal.toString())) {
    return formatDateInt(Number(dateVal));
  }

  // Handle ISO date string
  const date = new Date(dateVal);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Check if DuckDB is ready
export function isDuckDBReady(): boolean {
  return initialized;
}

// Get initialization status
export async function waitForInit(): Promise<void> {
  await initDuckDB();
}

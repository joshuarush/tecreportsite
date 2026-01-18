import { supabase, type Contribution, type Filer, type Expenditure } from './supabase';

export interface SearchFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  contributorType?: string;
  party?: string;
  officeType?: string;
  district?: string;
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

// Search contributions by contributor name
export async function searchContributions(
  filters: SearchFilters,
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<SearchResult<Contribution>> {
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('contributions')
    .select('*', { count: 'exact' });

  // Apply text search
  if (filters.query) {
    query = query.ilike('contributor_name', `%${filters.query}%`);
  }

  // Apply date filters
  if (filters.dateFrom) {
    query = query.gte('date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('date', filters.dateTo);
  }

  // Apply amount filters
  if (filters.amountMin !== undefined) {
    query = query.gte('amount', filters.amountMin);
  }
  if (filters.amountMax !== undefined) {
    query = query.lte('amount', filters.amountMax);
  }

  // Apply contributor type filter
  if (filters.contributorType) {
    query = query.eq('contributor_type', filters.contributorType);
  }

  // Apply pagination and ordering
  const { data, error, count } = await query
    .order('date', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('Error searching contributions:', error);
    throw error;
  }

  return {
    data: data || [],
    count: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

// Search filers (candidates and PACs)
export async function searchFilers(
  filters: SearchFilters,
  pagination: PaginationParams = { page: 1, pageSize: 25 }
): Promise<SearchResult<Filer>> {
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('filers')
    .select('*', { count: 'exact' });

  if (filters.query) {
    query = query.ilike('name', `%${filters.query}%`);
  }

  if (filters.party) {
    query = query.eq('party', filters.party);
  }

  if (filters.officeType) {
    query = query.eq('office_held', filters.officeType);
  }

  if (filters.district) {
    query = query.eq('office_district', filters.district);
  }

  const { data, error, count } = await query
    .order('name', { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('Error searching filers:', error);
    throw error;
  }

  return {
    data: data || [],
    count: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

// Get filer by ID with summary stats
export async function getFilerById(filerId: string): Promise<{
  filer: Filer | null;
  totalContributions: number;
  totalExpended: number;
  contributionCount: number;
} | null> {
  const { data: filer, error } = await supabase
    .from('filers')
    .select('*')
    .eq('id', filerId)
    .single();

  if (error || !filer) {
    return null;
  }

  // Get contribution totals
  const { data: contribStats } = await supabase
    .from('contributions')
    .select('amount')
    .eq('filer_id', filerId);

  const totalContributions = contribStats?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
  const contributionCount = contribStats?.length || 0;

  // Get expenditure totals
  const { data: expendStats } = await supabase
    .from('expenditures')
    .select('amount')
    .eq('filer_id', filerId);

  const totalExpended = expendStats?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

  return {
    filer,
    totalContributions,
    totalExpended,
    contributionCount,
  };
}

// Get top donors for a filer
export async function getTopDonors(
  filerId: string,
  limit: number = 10
): Promise<{ name: string; total: number; count: number }[]> {
  const { data, error } = await supabase
    .from('contributions')
    .select('contributor_name, amount')
    .eq('filer_id', filerId);

  if (error || !data) {
    return [];
  }

  // Aggregate by contributor name
  const aggregated = data.reduce((acc, row) => {
    const name = row.contributor_name || 'Unknown';
    if (!acc[name]) {
      acc[name] = { total: 0, count: 0 };
    }
    acc[name].total += row.amount || 0;
    acc[name].count += 1;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  return Object.entries(aggregated)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
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
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

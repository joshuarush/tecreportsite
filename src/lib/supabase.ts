import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration missing. Please set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.');
    }

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
}

// Legacy export for compatibility - use getSupabase() instead
export const supabase = {
  from: (table: string) => getSupabase().from(table),
};

// Type definitions for our database tables
export interface Filer {
  id: string;
  name: string;
  type: string;
  party?: string;
  office_held?: string;
  office_district?: string;
  status?: string;
}

export interface Contribution {
  id: string;
  filer_id: string;
  filer_name?: string;
  contributor_name: string;
  contributor_type?: string;
  contributor_city?: string;
  contributor_state?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  amount: number;
  date: string;
  description?: string;
  report_id?: string;
}

export interface Expenditure {
  id: string;
  filer_id: string;
  filer_name?: string;
  payee_name: string;
  payee_city?: string;
  payee_state?: string;
  amount: number;
  date: string;
  category?: string;
  description?: string;
  report_id?: string;
}

export interface Report {
  id: string;
  filer_id: string;
  filer_name?: string;
  report_type?: string;
  period_start?: string;
  period_end?: string;
  filed_date?: string;
  total_contributions?: number;
  total_expenditures?: number;
  cash_on_hand?: number;
}

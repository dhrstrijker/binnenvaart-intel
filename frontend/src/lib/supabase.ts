import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

export interface Vessel {
  id: string;
  name: string;
  type: string;
  length_m: number | null;
  width_m: number | null;
  tonnage: number | null;
  build_year: number | null;
  price: number | null;
  url: string;
  image_url: string | null;
  source: string;
  source_id: string;
  scraped_at: string;
  first_seen_at: string;
  updated_at: string;
  raw_details?: Record<string, unknown> | null;
  image_urls?: Array<{ original?: string; thumbnail?: string; sorting_no?: number } | string> | null;
}

export interface PriceHistory {
  id: string;
  vessel_id: string;
  price: number;
  recorded_at: string;
}

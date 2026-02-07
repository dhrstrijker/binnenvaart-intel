import { createClient } from "./supabase/client";

/**
 * @deprecated Use createClient() from "@/lib/supabase/client" directly
 */
export function getSupabase() {
  return createClient();
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
  status: string;
  raw_details?: Record<string, unknown> | null;
  image_urls?: Array<{ original?: string; thumbnail?: string; sorting_no?: number } | string> | null;
  canonical_vessel_id?: string | null;
  linked_sources?: Array<{ source: string; price: number | null; url: string; vessel_id: string }> | null;
}

export interface PriceHistory {
  id: string;
  vessel_id: string;
  price: number;
  recorded_at: string;
}

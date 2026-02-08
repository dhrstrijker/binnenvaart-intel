/** Columns selected for vessel list views (Dashboard, similar vessels, etc.) */
export const VESSEL_LIST_COLUMNS = "id, name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, source_id, scraped_at, first_seen_at, updated_at, status, canonical_vessel_id, linked_sources, predicted_price, prediction_confidence, prediction_range_low, prediction_range_high";

/** Columns selected for vessel detail views (includes raw_details, image_urls, condition_signals) */
export const VESSEL_DETAIL_COLUMNS = `${VESSEL_LIST_COLUMNS}, raw_details, image_urls, condition_signals`;

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
  predicted_price?: number | null;
  prediction_confidence?: "high" | "medium" | "low" | null;
  prediction_range_low?: number | null;
  prediction_range_high?: number | null;
  condition_signals?: Record<string, unknown> | null;
}

export interface PriceHistory {
  id: string;
  vessel_id: string;
  price: number;
  recorded_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  vessel_id: string;
  added_at: string;
}

export interface WatchlistEntry {
  id: string;
  user_id: string;
  vessel_id: string;
  added_at: string;
  notify_price_change: boolean;
  notify_status_change: boolean;
}

export interface ActivityLogEntry {
  id: string;
  vessel_id: string;
  event_type: "inserted" | "price_changed" | "removed" | "sold";
  vessel_name: string;
  vessel_source: string;
  old_price: number | null;
  new_price: number | null;
  recorded_at: string;
}

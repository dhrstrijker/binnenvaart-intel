/** Columns selected for vessel list views (Dashboard, similar vessels, etc.) */
export const VESSEL_LIST_COLUMNS = "id, name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, source_id, scraped_at, first_seen_at, updated_at, status, canonical_vessel_id, linked_sources, predicted_price, prediction_confidence, prediction_range_low, prediction_range_high";

/** Columns selected for vessel detail views (includes raw_details, image_urls, condition_signals) */
export const VESSEL_DETAIL_COLUMNS = `${VESSEL_LIST_COLUMNS}, raw_details, image_urls, condition_signals, structured_details`;

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
  structured_details?: StructuredDetails | null;
}

export interface StructuredEngine {
  make: string;
  type?: string | null;
  power_hp?: number | null;
  year?: number | null;
  hours?: number | null;
  hours_date?: string | null;
  revision_year?: number | null;
  hours_since_revision?: number | null;
  emission_class?: string | null;
}

export interface StructuredGenerator {
  make: string;
  type?: string | null;
  kva?: number | null;
  year?: number | null;
  hours?: number | null;
}

export interface StructuredGearbox {
  make: string;
  type?: string | null;
  year?: number | null;
}

export interface StructuredBowThruster {
  make?: string | null;
  type?: string | null;
  power_hp?: number | null;
  year?: number | null;
}

export interface StructuredCertificate {
  name: string;
  valid_until?: string | null;
  description?: string | null;
}

export interface StructuredHolds {
  count?: number | null;
  capacity_m3?: number | null;
  teu?: number | null;
  dimensions?: string | null;
  wall_type?: string | null;
  floor_material?: string | null;
  floor_thickness_mm?: number | null;
  hatch_make?: string | null;
  hatch_type?: string | null;
  hatch_year?: number | null;
}

export interface StructuredTanker {
  tank_count?: number | null;
  capacity_m3?: number | null;
  coating?: string | null;
  pipe_system?: string | null;
  cargo_pumps?: string | {
    make?: string | null;
    type?: string | null;
    year?: number | null;
    revision_year?: number | null;
    capacity_m3_per_hour?: number | null;
    revision_description?: string | null;
  } | Array<{
    make?: string | null;
    type?: string | null;
    year?: number | null;
    revision_year?: number | null;
    capacity_m3_per_hour?: number | null;
    revision_description?: string | null;
  }> | null;
  heating?: string | null;
}

export interface StructuredImprovement {
  year: number;
  description: string;
}

export interface StructuredDetails {
  shipyard?: string | null;
  finishing_yard?: string | null;
  hull_year?: number | null;
  eni_number?: string | null;
  construction?: string | null;
  double_hull?: boolean | null;

  depth_m?: number | null;
  airdraft_empty_m?: number | null;
  airdraft_ballast_m?: number | null;
  airdraft_lowered_m?: number | null;

  engines?: StructuredEngine[];
  gearboxes?: StructuredGearbox[];
  generators?: StructuredGenerator[];
  bow_thrusters?: StructuredBowThruster[];

  propeller?: string | null;
  nozzle?: string | null;
  steering?: string | null;

  certificates?: StructuredCertificate[];

  holds?: StructuredHolds | null;
  tanker?: StructuredTanker | null;

  fuel_capacity_l?: number | null;
  freshwater_capacity_l?: number | null;

  car_crane?: string | null;
  spud_poles?: string | null;
  anchor_winches?: string | null;
  wheelhouse?: string | null;

  accommodation_aft?: string | null;
  accommodation_fwd?: string | null;
  bedrooms?: number | null;
  airco?: boolean | null;

  improvements?: StructuredImprovement[];

  overall_condition?: "excellent" | "good" | "average" | "poor" | "unknown";
  positive_factors?: string[];
  negative_factors?: string[];
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

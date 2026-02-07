import { createClient } from "@/lib/supabase/client";
import type { SavedSearchFilters } from "./savedSearchTypes";

/**
 * Build a Supabase query for vessels matching the given saved-search filters.
 * Returns the query builder so the caller can chain `.select()` for count-only
 * or full data retrieval.
 */
export function buildSavedSearchQuery(filters: SavedSearchFilters) {
  const supabase = createClient();
  let query = supabase
    .from("vessels")
    .select("id, name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, status, canonical_vessel_id", { count: "exact" })
    .is("canonical_vessel_id", null)
    .not("status", "in", '("removed","sold")');

  if (filters.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }
  if (filters.type) {
    query = query.eq("type", filters.type);
  }
  if (filters.source) {
    query = query.eq("source", filters.source);
  }
  if (filters.minPrice) {
    query = query.gte("price", Number(filters.minPrice));
  }
  if (filters.maxPrice) {
    query = query.lte("price", Number(filters.maxPrice));
  }
  if (filters.minLength) {
    query = query.gte("length_m", Number(filters.minLength));
  }
  if (filters.maxLength) {
    query = query.lte("length_m", Number(filters.maxLength));
  }
  if (filters.minWidth) {
    query = query.gte("width_m", Number(filters.minWidth));
  }
  if (filters.maxWidth) {
    query = query.lte("width_m", Number(filters.maxWidth));
  }
  if (filters.minBuildYear) {
    query = query.gte("build_year", Number(filters.minBuildYear));
  }
  if (filters.maxBuildYear) {
    query = query.lte("build_year", Number(filters.maxBuildYear));
  }
  if (filters.minTonnage) {
    query = query.gte("tonnage", Number(filters.minTonnage));
  }
  if (filters.maxTonnage) {
    query = query.lte("tonnage", Number(filters.maxTonnage));
  }

  return query;
}

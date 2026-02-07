import { createClient } from "./supabase/server";
import type { Vessel } from "./supabase";

export async function getVesselById(id: string): Promise<Vessel | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vessels")
    .select("id, name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, source_id, scraped_at, first_seen_at, updated_at, status, canonical_vessel_id, linked_sources, raw_details, image_urls")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function getAllVesselIds(): Promise<{ id: string; updated_at: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vessels")
    .select("id, updated_at")
    .is("canonical_vessel_id", null);

  if (error || !data) return [];
  return data;
}

export async function getSimilarVessels(vessel: Vessel, limit = 6): Promise<Vessel[]> {
  const supabase = await createClient();

  let query = supabase
    .from("vessels")
    .select("id, name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, source_id, scraped_at, first_seen_at, updated_at, status, canonical_vessel_id, linked_sources")
    .is("canonical_vessel_id", null)
    .neq("id", vessel.id)
    .neq("status", "removed");

  if (vessel.type) {
    query = query.eq("type", vessel.type);
  }

  const { data, error } = await query.limit(limit * 3);

  if (error || !data) return [];

  // Sort by price proximity
  if (vessel.price !== null) {
    data.sort((a, b) => {
      const diffA = a.price !== null ? Math.abs(a.price - vessel.price!) : Infinity;
      const diffB = b.price !== null ? Math.abs(b.price - vessel.price!) : Infinity;
      return diffA - diffB;
    });
  }

  return data.slice(0, limit);
}

import { createClient } from "./supabase/server";
import type { Vessel } from "./supabase";
import { VESSEL_LIST_COLUMNS, VESSEL_DETAIL_COLUMNS } from "./supabase";

export async function getVesselById(id: string): Promise<Vessel | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vessels")
    .select(VESSEL_DETAIL_COLUMNS)
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

function dimensionDistance(ref: Vessel, candidate: Vessel): number {
  let sum = 0;
  let dimensions = 0;

  if (ref.length_m && candidate.length_m) {
    sum += ((candidate.length_m - ref.length_m) / ref.length_m) ** 2;
    dimensions++;
  }
  if (ref.width_m && candidate.width_m) {
    sum += ((candidate.width_m - ref.width_m) / ref.width_m) ** 2;
    dimensions++;
  }
  if (ref.tonnage && candidate.tonnage) {
    sum += ((candidate.tonnage - ref.tonnage) / ref.tonnage) ** 2;
    dimensions++;
  }

  // No comparable dimensions — push to the end
  if (dimensions === 0) return Infinity;

  return Math.sqrt(sum / dimensions);
}

export async function getSimilarVessels(vessel: Vessel, limit = 6): Promise<Vessel[]> {
  const supabase = await createClient();

  let query = supabase
    .from("vessels")
    .select(VESSEL_LIST_COLUMNS)
    .is("canonical_vessel_id", null)
    .neq("id", vessel.id)
    .neq("status", "removed");

  if (vessel.type) {
    query = query.eq("type", vessel.type);
  }

  const { data, error } = await query.limit(limit * 3);

  if (error || !data) return [];

  // Sort by dimension proximity (length, width, tonnage)
  // Normalize each dimension by the vessel's own value to weight them equally
  data.sort((a, b) => {
    const distA = dimensionDistance(vessel, a);
    const distB = dimensionDistance(vessel, b);
    return distA - distB;
  });

  return data.slice(0, limit);
}

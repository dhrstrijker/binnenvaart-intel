"use client";

import { useMemo } from "react";
import type { Vessel } from "@/lib/supabase";
import type { FilterState } from "@/components/Filters";

function applyRange(
  result: Vessel[],
  min: string,
  max: string,
  get: (v: Vessel) => number | null,
): Vessel[] {
  if (min) { const n = Number(min); result = result.filter(v => get(v) !== null && get(v)! >= n); }
  if (max) { const n = Number(max); result = result.filter(v => get(v) !== null && get(v)! <= n); }
  return result;
}

export function useVesselFiltering(vessels: Vessel[], filters: FilterState): Vessel[] {
  return useMemo(() => {
    let result = [...vessels];

    if (!filters.showRemoved) {
      result = result.filter((v) => v.status !== "removed" && v.status !== "sold");
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((v) => v.name.toLowerCase().includes(q));
    }

    if (filters.type) {
      result = result.filter((v) => v.type === filters.type);
    }

    if (filters.source) {
      result = result.filter((v) =>
        v.source === filters.source ||
        (v.linked_sources?.some((ls) => ls.source === filters.source) ?? false)
      );
    }

    result = applyRange(result, filters.minPrice, filters.maxPrice, v => v.price);
    result = applyRange(result, filters.minLength, filters.maxLength, v => v.length_m);
    result = applyRange(result, filters.minTonnage, filters.maxTonnage, v => v.tonnage);
    result = applyRange(result, filters.minBuildYear, filters.maxBuildYear, v => v.build_year);

    switch (filters.sort) {
      case "price_asc":
        result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        break;
      case "price_desc":
        result.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "newest":
      default:
        result.sort(
          (a, b) =>
            new Date(b.first_seen_at).getTime() -
            new Date(a.first_seen_at).getTime()
        );
    }

    return result;
  }, [vessels, filters]);
}

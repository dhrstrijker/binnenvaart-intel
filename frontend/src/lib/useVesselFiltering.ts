"use client";

import { useMemo } from "react";
import type { Vessel } from "@/lib/supabase";
import type { FilterState } from "@/components/Filters";

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

    if (filters.minPrice) {
      const min = Number(filters.minPrice);
      result = result.filter((v) => v.price !== null && v.price >= min);
    }

    if (filters.maxPrice) {
      const max = Number(filters.maxPrice);
      result = result.filter((v) => v.price !== null && v.price <= max);
    }

    if (filters.minLength) {
      const min = Number(filters.minLength);
      result = result.filter((v) => v.length_m !== null && v.length_m >= min);
    }

    if (filters.maxLength) {
      const max = Number(filters.maxLength);
      result = result.filter((v) => v.length_m !== null && v.length_m <= max);
    }

    if (filters.minTonnage) {
      const min = Number(filters.minTonnage);
      result = result.filter((v) => v.tonnage !== null && v.tonnage >= min);
    }

    if (filters.maxTonnage) {
      const max = Number(filters.maxTonnage);
      result = result.filter((v) => v.tonnage !== null && v.tonnage <= max);
    }

    if (filters.minBuildYear) {
      const min = Number(filters.minBuildYear);
      result = result.filter((v) => v.build_year !== null && v.build_year >= min);
    }

    if (filters.maxBuildYear) {
      const max = Number(filters.maxBuildYear);
      result = result.filter((v) => v.build_year !== null && v.build_year <= max);
    }

    switch (filters.sort) {
      case "price_asc":
        result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        break;
      case "price_desc":
        result.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
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

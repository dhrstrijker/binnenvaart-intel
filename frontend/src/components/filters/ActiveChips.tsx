import React from "react";
import type { FilterState } from "@/components/Filters";
import { SOURCES } from "@/lib/filterConfig";
import { formatPriceShort } from "@/lib/formatting";

function rangeLabel(min: string, max: string, unit: string): string {
  if (min && max) return `${min}${unit} – ${max}${unit}`;
  if (min) return `${min}${unit}+`;
  if (max) return `tot ${max}${unit}`;
  return "";
}

export default function ActiveChips({
  filters,
  onClear,
}: {
  filters: FilterState;
  onClear: (partial: Partial<FilterState>) => void;
}) {
  const chips: { label: string; clear: Partial<FilterState> }[] = [];

  if (filters.type) chips.push({ label: filters.type, clear: { type: "" } });
  if (filters.source) {
    const src = SOURCES.find((s) => s.value === filters.source);
    chips.push({ label: src?.label ?? filters.source, clear: { source: "" } });
  }
  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice ? formatPriceShort(Number(filters.minPrice)) : "";
    const max = filters.maxPrice ? formatPriceShort(Number(filters.maxPrice)) : "";
    const label = min && max ? `${min} – ${max}` : min ? `${min}+` : `Tot ${max}`;
    chips.push({ label, clear: { minPrice: "", maxPrice: "" } });
  }
  if (filters.minLength || filters.maxLength) {
    const label = rangeLabel(filters.minLength, filters.maxLength, "m");
    chips.push({ label: `Lengte: ${label}`, clear: { minLength: "", maxLength: "" } });
  }
  if (filters.minTonnage || filters.maxTonnage) {
    const label = rangeLabel(filters.minTonnage, filters.maxTonnage, "t");
    chips.push({ label: `Tonnage: ${label}`, clear: { minTonnage: "", maxTonnage: "" } });
  }
  if (filters.minBuildYear || filters.maxBuildYear) {
    const label = rangeLabel(filters.minBuildYear, filters.maxBuildYear, "");
    chips.push({ label: `Bouwjaar: ${label}`, clear: { minBuildYear: "", maxBuildYear: "" } });
  }
  if (filters.search) chips.push({ label: `"${filters.search}"`, clear: { search: "" } });
  if (filters.showRemoved) chips.push({ label: "Incl. verkocht", clear: { showRemoved: false } });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      {chips.map((chip, i) => (
        <button
          key={i}
          onClick={() => onClear(chip.clear)}
          className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 ring-1 ring-cyan-200 transition hover:bg-cyan-100"
        >
          {chip.label}
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ))}
    </div>
  );
}

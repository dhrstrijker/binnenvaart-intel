"use client";

import React, { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { formatPriceShort } from "@/lib/formatting";

export interface FilterState {
  search: string;
  type: string;
  source: string;
  minPrice: string;
  maxPrice: string;
  minLength: string;
  maxLength: string;
  minTonnage: string;
  maxTonnage: string;
  minBuildYear: string;
  maxBuildYear: string;
  sort: string;
  showRemoved: boolean;
}

/* ── Preset range definitions ─────────────────────────────── */

interface Preset {
  label: string;
  min: string;
  max: string;
}

const LENGTH_PRESETS: Preset[] = [
  { label: "Alle lengtes", min: "", max: "" },
  { label: "Onder 40m", min: "", max: "40" },
  { label: "40 – 60m", min: "40", max: "60" },
  { label: "60 – 80m", min: "60", max: "80" },
  { label: "80 – 100m", min: "80", max: "100" },
  { label: "100 – 120m", min: "100", max: "120" },
  { label: "120m+", min: "120", max: "" },
];

const PRICE_PRESETS: Preset[] = [
  { label: "Alle prijzen", min: "", max: "" },
  { label: "Tot €100k", min: "", max: "100000" },
  { label: "Tot €200k", min: "", max: "200000" },
  { label: "Tot €300k", min: "", max: "300000" },
  { label: "Tot €500k", min: "", max: "500000" },
  { label: "Tot €700k", min: "", max: "700000" },
  { label: "Tot €1M", min: "", max: "1000000" },
  { label: "Tot €1,5M", min: "", max: "1500000" },
  { label: "Tot €2M", min: "", max: "2000000" },
  { label: "Tot €2,5M", min: "", max: "2500000" },
  { label: "Tot €3M", min: "", max: "3000000" },
  { label: "Tot €5M", min: "", max: "5000000" },
  { label: "Tot €7M", min: "", max: "7000000" },
  { label: "Tot €10M", min: "", max: "10000000" },
  { label: "€10M+", min: "10000000", max: "" },
];

const TONNAGE_PRESETS: Preset[] = [
  { label: "Alle tonnages", min: "", max: "" },
  { label: "Onder 500t", min: "", max: "500" },
  { label: "500 – 1000t", min: "500", max: "1000" },
  { label: "1000 – 2000t", min: "1000", max: "2000" },
  { label: "2000 – 3000t", min: "2000", max: "3000" },
  { label: "3000t+", min: "3000", max: "" },
];

/** Find matching preset index, or -1 if custom */
function findPresetIndex(presets: Preset[], minVal: string, maxVal: string): number {
  return presets.findIndex((p) => p.min === minVal && p.max === maxVal);
}

function customRangeLabel(min: string, max: string, unit: string, formatter?: (v: number) => string): string {
  const fmt = formatter ?? ((v: number) => `${v}${unit}`);
  const hasMin = min !== "";
  const hasMax = max !== "";
  if (hasMin && hasMax) return `${fmt(Number(min))} – ${fmt(Number(max))}`;
  if (hasMin) return `${fmt(Number(min))}+`;
  if (hasMax) return `Tot ${fmt(Number(max))}`;
  return "Aangepast"; // fallback, shouldn't happen
}

/* ── Chevron SVG (shared) ─────────────────────────────────── */

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/* ── Component ────────────────────────────────────────────── */

interface FiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  availableTypes: string[];
  vesselCount: number;
  user?: User | null;
  onSaveAsSearch?: (filters: FilterState) => void;
  onAuthPrompt?: () => void;
}

export default function Filters({
  filters,
  onFilterChange,
  availableTypes,
  vesselCount,
  user,
  onSaveAsSearch,
  onAuthPrompt,
}: FiltersProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const update = (partial: Partial<FilterState>) => {
    onFilterChange({ ...filters, ...partial });
  };

  /* ── Preset helpers ──────────────────────────────────────── */

  const lengthIdx = findPresetIndex(LENGTH_PRESETS, filters.minLength, filters.maxLength);
  const priceIdx = findPresetIndex(PRICE_PRESETS, filters.minPrice, filters.maxPrice);
  const tonnageIdx = findPresetIndex(TONNAGE_PRESETS, filters.minTonnage, filters.maxTonnage);

  const handlePresetChange = (
    presets: Preset[],
    value: string,
    minKey: keyof FilterState,
    maxKey: keyof FilterState,
  ) => {
    const idx = Number(value);
    const preset = presets[idx];
    if (preset) {
      update({ [minKey]: preset.min, [maxKey]: preset.max });
    }
  };

  /* ── Advanced filter count ───────────────────────────────── */

  let advancedCount = 0;
  if (filters.source) advancedCount++;
  if (filters.search) advancedCount++;
  if (filters.minBuildYear || filters.maxBuildYear) advancedCount++;
  if (filters.showRemoved) advancedCount++;

  const hasAnyAdvanced = advancedCount > 0;

  const showAdvanced = advancedOpen;

  /* ── Shared select styling ───────────────────────────────── */

  const selectBase =
    "w-full appearance-none rounded-lg border bg-white pl-3 pr-8 py-2.5 text-sm font-medium outline-none transition-all cursor-pointer";
  const selectIdle = "border-slate-200 text-slate-600 hover:border-slate-300";
  const selectActive = "border-cyan-400 bg-cyan-50 text-cyan-700";

  function selectClass(isActive: boolean) {
    return `${selectBase} ${isActive ? selectActive : selectIdle}`;
  }

  /* ── Zoeken scroll ───────────────────────────────────────── */

  const handleZoeken = () => {
    const el = document.getElementById("vessel-results");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="space-y-3">
      {/* ═══ Zone A: Primary Filter Bar ═══ */}
      <div className="rounded-xl bg-white p-4 shadow-md ring-1 ring-gray-100">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {/* Type */}
          <div className="relative">
            <label htmlFor="filter-type" className="sr-only">Type</label>
            <select
              id="filter-type"
              value={filters.type}
              onChange={(e) => update({ type: e.target.value })}
              className={selectClass(!!filters.type)}
            >
              <option value="">Alle types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Length preset */}
          <div className="relative">
            <label htmlFor="filter-length" className="sr-only">Lengte</label>
            <select
              id="filter-length"
              value={lengthIdx >= 0 ? String(lengthIdx) : "custom"}
              onChange={(e) =>
                handlePresetChange(LENGTH_PRESETS, e.target.value, "minLength", "maxLength")
              }
              className={selectClass(lengthIdx > 0 || (lengthIdx < 0 && !!(filters.minLength || filters.maxLength)))}
            >
              {lengthIdx < 0 && (
                <option value="custom" disabled>
                  {customRangeLabel(filters.minLength, filters.maxLength, "m")}
                </option>
              )}
              {LENGTH_PRESETS.map((p, i) => (
                <option key={i} value={String(i)}>{p.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Price preset */}
          <div className="relative">
            <label htmlFor="filter-price" className="sr-only">Prijs</label>
            <select
              id="filter-price"
              value={priceIdx >= 0 ? String(priceIdx) : "custom"}
              onChange={(e) =>
                handlePresetChange(PRICE_PRESETS, e.target.value, "minPrice", "maxPrice")
              }
              className={selectClass(priceIdx > 0 || (priceIdx < 0 && !!(filters.minPrice || filters.maxPrice)))}
            >
              {priceIdx < 0 && (
                <option value="custom" disabled>
                  {customRangeLabel(filters.minPrice, filters.maxPrice, "", formatPriceShort)}
                </option>
              )}
              {PRICE_PRESETS.map((p, i) => (
                <option key={i} value={String(i)}>{p.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Tonnage preset */}
          <div className="relative">
            <label htmlFor="filter-tonnage" className="sr-only">Tonnage</label>
            <select
              id="filter-tonnage"
              value={tonnageIdx >= 0 ? String(tonnageIdx) : "custom"}
              onChange={(e) =>
                handlePresetChange(TONNAGE_PRESETS, e.target.value, "minTonnage", "maxTonnage")
              }
              className={selectClass(tonnageIdx > 0 || (tonnageIdx < 0 && !!(filters.minTonnage || filters.maxTonnage)))}
            >
              {tonnageIdx < 0 && (
                <option value="custom" disabled>
                  {customRangeLabel(filters.minTonnage, filters.maxTonnage, "t")}
                </option>
              )}
              {TONNAGE_PRESETS.map((p, i) => (
                <option key={i} value={String(i)}>{p.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Zoeken CTA */}
          <button
            type="button"
            onClick={handleZoeken}
            className="col-span-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 active:bg-cyan-800 sm:col-span-1 lg:col-span-1"
          >
            Zoeken
          </button>
        </div>
      </div>

      {/* ═══ Zone B: Secondary Row ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        {/* Left: Sort + result count */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative">
            <label htmlFor="filter-sort" className="sr-only">Sorteren</label>
            <select
              id="filter-sort"
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value })}
              className="appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 py-1.5 text-xs font-medium text-slate-600 outline-none transition hover:border-slate-300"
            >
              <option value="newest">Nieuwste eerst</option>
              <option value="price_asc">Prijs (laag - hoog)</option>
              <option value="price_desc">Prijs (hoog - laag)</option>
              <option value="name">Naam (A-Z)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>
          <span className="text-xs text-slate-400">
            {vesselCount} {vesselCount === 1 ? "schip" : "schepen"}
          </span>
        </div>

        {/* Right: Save search + Filters toggle */}
        <div className="flex items-center gap-2">
          {(filters.type || filters.source || filters.minPrice || filters.maxPrice || filters.search || filters.minLength || filters.maxLength || filters.minTonnage || filters.maxTonnage || filters.minBuildYear || filters.maxBuildYear) && (
            <button
              onClick={() => {
                if (user && onSaveAsSearch) {
                  onSaveAsSearch(filters);
                } else if (onAuthPrompt) {
                  onAuthPrompt();
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-medium text-cyan-700 transition hover:bg-cyan-100"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="hidden sm:inline">Zoekopdracht opslaan</span>
              <span className="sm:hidden">Opslaan</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showAdvanced
                ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Filters
            {advancedCount > 0 && (
              <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-cyan-600 px-1 text-[10px] font-bold text-white">
                {advancedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ═══ Zone C: Expandable Advanced Panel ═══ */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          showAdvanced ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="rounded-xl bg-white p-4 shadow-md ring-1 ring-gray-100">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Source */}
            <div className="relative">
              <label htmlFor="filter-source" className="mb-1 block text-xs font-medium text-slate-500">Makelaar</label>
              <select
                id="filter-source"
                value={filters.source}
                onChange={(e) => update({ source: e.target.value })}
                className={`${selectBase} ${filters.source ? selectActive : selectIdle}`}
              >
                <option value="">Alle makelaars</option>
                <option value="rensendriessen">Rensen & Driessen</option>
                <option value="galle">Galle Makelaars</option>
                <option value="pcshipbrokers">PC Shipbrokers</option>
                <option value="gtsschepen">GTS Schepen</option>
                <option value="gsk">GSK Brokers</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 bottom-3 h-4 w-4 text-slate-400" />
            </div>

            {/* Min build year */}
            <div>
              <label htmlFor="filter-min-build-year" className="mb-1 block text-xs font-medium text-slate-500">Min bouwjaar</label>
              <input
                id="filter-min-build-year"
                type="number"
                placeholder="bijv. 1980"
                value={filters.minBuildYear}
                onChange={(e) => update({ minBuildYear: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors hover:border-slate-300 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </div>

            {/* Max build year */}
            <div>
              <label htmlFor="filter-max-build-year" className="mb-1 block text-xs font-medium text-slate-500">Max bouwjaar</label>
              <input
                id="filter-max-build-year"
                type="number"
                placeholder="bijv. 2020"
                value={filters.maxBuildYear}
                onChange={(e) => update({ maxBuildYear: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors hover:border-slate-300 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </div>

            {/* Search by name */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label htmlFor="vessel-search" className="mb-1 block text-xs font-medium text-slate-500">Zoek op naam</label>
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  id="vessel-search"
                  type="text"
                  placeholder="Scheepsnaam..."
                  value={filters.search}
                  onChange={(e) => update({ search: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors hover:border-slate-300 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
            </div>

            {/* Show removed toggle */}
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filters.showRemoved}
                  onChange={(e) => update({ showRemoved: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
                />
                Toon verkochte schepen
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

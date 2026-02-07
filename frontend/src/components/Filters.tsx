"use client";

import React from "react";
import type { User } from "@supabase/supabase-js";

export interface FilterState {
  search: string;
  type: string;
  source: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  showRemoved: boolean;
}

interface FiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  availableTypes: string[];
  vesselCount: number;
  user?: User | null;
  onSaveAsSearch?: (filters: FilterState) => void;
}

export default function Filters({
  filters,
  onFilterChange,
  availableTypes,
  vesselCount,
  user,
  onSaveAsSearch,
}: FiltersProps) {
  const update = (partial: Partial<FilterState>) => {
    onFilterChange({ ...filters, ...partial });
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-md ring-1 ring-gray-100">
      {/* Search bar */}
      <div className="relative">
        <label htmlFor="vessel-search" className="sr-only">Zoek op naam</label>
        <svg
          className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          id="vessel-search"
          type="text"
          placeholder="Zoek op naam..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
        />
      </div>

      {/* Filter row */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {/* Type */}
        <div>
          <label htmlFor="filter-type" className="sr-only">Filter op type</label>
          <select
            id="filter-type"
            value={filters.type}
            onChange={(e) => update({ type: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          >
            <option value="">Alle types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Source */}
        <div>
          <label htmlFor="filter-source" className="sr-only">Filter op bron</label>
          <select
            id="filter-source"
            value={filters.source}
            onChange={(e) => update({ source: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          >
            <option value="">Alle bronnen</option>
            <option value="rensendriessen">Rensen & Driessen</option>
            <option value="galle">Galle Makelaars</option>
            <option value="pcshipbrokers">PC Shipbrokers</option>
            <option value="gtsschepen">GTS Schepen</option>
            <option value="gsk">GSK Brokers</option>
          </select>
        </div>

        {/* Min price */}
        <div>
          <label htmlFor="filter-min-price" className="sr-only">Minimale prijs</label>
          <input
            id="filter-min-price"
            type="number"
            placeholder="Min prijs"
            value={filters.minPrice}
            onChange={(e) => update({ minPrice: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          />
        </div>

        {/* Max price */}
        <div>
          <label htmlFor="filter-max-price" className="sr-only">Maximale prijs</label>
          <input
            id="filter-max-price"
            type="number"
            placeholder="Max prijs"
            value={filters.maxPrice}
            onChange={(e) => update({ maxPrice: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          />
        </div>

        {/* Sort */}
        <div>
          <label htmlFor="filter-sort" className="sr-only">Sorteren</label>
          <select
            id="filter-sort"
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          >
            <option value="newest">Nieuwste eerst</option>
            <option value="price_asc">Prijs (laag - hoog)</option>
            <option value="price_desc">Prijs (hoog - laag)</option>
            <option value="name">Naam (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Status toggle + Result count + Save as search */}
      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.showRemoved}
            onChange={(e) => update({ showRemoved: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
          />
          Toon verkochte/verwijderde schepen
        </label>
        <div className="flex items-center gap-3">
          {user && onSaveAsSearch && (filters.type || filters.source || filters.minPrice || filters.maxPrice || filters.search) && (
            <button
              onClick={() => onSaveAsSearch(filters)}
              className="flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 transition hover:bg-cyan-100"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Opslaan als zoekopdracht
            </button>
          )}
          <span className="text-xs text-slate-400">
            {vesselCount} {vesselCount === 1 ? "schip" : "schepen"} gevonden
          </span>
        </div>
      </div>
    </div>
  );
}

import React, { useRef, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import type { FilterState } from "@/components/Filters";
import { SOURCES } from "@/lib/filterConfig";

interface FiltersDropdownProps {
  filters: FilterState;
  update: (partial: Partial<FilterState>) => void;
  user?: User | null;
  onSaveAsSearch?: (filters: FilterState) => void;
  onAuthPrompt?: () => void;
  extraFilterCount: number;
  onClose: () => void;
}

export default function FiltersDropdown({
  filters,
  update,
  user,
  onSaveAsSearch,
  onAuthPrompt,
  extraFilterCount,
  onClose,
}: FiltersDropdownProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function updateDebounced(partial: Partial<FilterState>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update(partial), 200);
  }

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
      {/* Search */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Zoeken
        </label>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Scheepsnaam..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 outline-none transition hover:border-slate-300 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          />
        </div>
      </div>

      {/* Source */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Bron
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => update({ source: filters.source === s.value ? "" : s.value })}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                filters.source === s.value
                  ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tonnage range */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Tonnage (t)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={filters.minTonnage}
            onChange={(e) => updateDebounced({ minTonnage: e.target.value })}
            placeholder="Min"
            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
          />
          <span className="text-sm text-slate-300">–</span>
          <input
            type="number"
            value={filters.maxTonnage}
            onChange={(e) => updateDebounced({ maxTonnage: e.target.value })}
            placeholder="Max"
            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
          />
        </div>
      </div>

      {/* Build year range */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Bouwjaar
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={filters.minBuildYear}
            onChange={(e) => updateDebounced({ minBuildYear: e.target.value })}
            placeholder="Van"
            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
          />
          <span className="text-sm text-slate-300">–</span>
          <input
            type="number"
            value={filters.maxBuildYear}
            onChange={(e) => updateDebounced({ maxBuildYear: e.target.value })}
            placeholder="Tot"
            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
          />
        </div>
      </div>

      {/* Sort */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Sorteren
        </label>
        <select
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value })}
          className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-cyan-400"
        >
          <option value="newest">Nieuwste eerst</option>
          <option value="price_asc">Prijs (laag - hoog)</option>
          <option value="price_desc">Prijs (hoog - laag)</option>
          <option value="name">Naam (A-Z)</option>
        </select>
      </div>

      {/* Show removed */}
      <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.showRemoved}
          onChange={(e) => update({ showRemoved: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
        />
        Inclusief verkochte schepen
      </label>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        {extraFilterCount > 0 ? (
          <button
            type="button"
            onClick={() =>
              update({
                search: "",
                source: "",
                minTonnage: "",
                maxTonnage: "",
                minBuildYear: "",
                maxBuildYear: "",
                sort: "newest",
                showRemoved: false,
              })
            }
            className="text-sm font-medium text-slate-500 underline transition hover:text-slate-700"
          >
            Wis filters
          </button>
        ) : (
          <div />
        )}
        {onSaveAsSearch && (
          <button
            type="button"
            onClick={() => {
              if (user) onSaveAsSearch(filters);
              else if (onAuthPrompt) onAuthPrompt();
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Opslaan
          </button>
        )}
      </div>
    </div>
  );
}

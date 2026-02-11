import React, { useId } from "react";
import { createPortal } from "react-dom";
import type { FilterState } from "@/components/Filters";
import { SOURCES } from "@/lib/filterConfig";

interface FiltersDropdownProps {
  id?: string;
  mobileSheet?: boolean;
  filters: FilterState;
  update: (partial: Partial<FilterState>) => void;
  onSaveAsSearch?: (filters: FilterState) => void;
  extraFilterCount: number;
  onClose: () => void;
}

export default function FiltersDropdown({
  id,
  mobileSheet = false,
  filters,
  update,
  onSaveAsSearch,
  extraFilterCount,
  onClose,
}: FiltersDropdownProps) {
  const titleId = useId();
  const searchInputId = useId();
  const minTonnageId = useId();
  const maxTonnageId = useId();
  const minBuildYearId = useId();
  const maxBuildYearId = useId();
  const sortSelectId = useId();
  const canUseDOM = typeof window !== "undefined" && typeof document !== "undefined";

  const content = (
    <div className={mobileSheet ? "fixed inset-0 z-[70]" : ""}>
      {mobileSheet && (
        <div
          className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        id={id}
        role="dialog"
        aria-modal={mobileSheet}
        aria-labelledby={mobileSheet ? titleId : undefined}
        aria-label={mobileSheet ? undefined : "Extra filters"}
        className={
          mobileSheet
            ? "absolute inset-x-0 bottom-0 z-[80]"
            : "absolute left-0 right-0 top-full z-50 mt-3"
        }
      >
        <div className={mobileSheet ? "mx-auto w-full max-w-[44rem] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" : ""}>
        <div
          className={`flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl ${
            mobileSheet ? "max-h-[90dvh] rounded-t-2xl" : "rounded-2xl"
          }`}
          onClick={mobileSheet ? (e) => e.stopPropagation() : undefined}
        >
          {mobileSheet && (
            <div className="border-b border-slate-100 bg-white px-5 py-3">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="flex items-center justify-between">
                <h3 id={titleId} className="text-sm font-semibold text-slate-800">
                  Filters
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
                >
                  Sluiten
                </button>
              </div>
            </div>
          )}

          <div
            className={`${
              mobileSheet
                ? "flex-1 overflow-y-auto overscroll-contain px-5 py-4"
                : "px-5 pt-5"
            }`}
          >
            {/* Search */}
            <div className="mb-4">
              <label
                htmlFor={searchInputId}
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Zoeken
              </label>
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
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
                  id={searchInputId}
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id={minTonnageId}
                  type="number"
                  value={filters.minTonnage}
                  onChange={(e) => update({ minTonnage: e.target.value })}
                  placeholder="Min"
                  aria-label="Minimum tonnage"
                  className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
                />
                <span className="hidden text-sm text-slate-300 sm:inline">–</span>
                <input
                  id={maxTonnageId}
                  type="number"
                  value={filters.maxTonnage}
                  onChange={(e) => update({ maxTonnage: e.target.value })}
                  placeholder="Max"
                  aria-label="Maximum tonnage"
                  className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
                />
              </div>
            </div>

            {/* Build year range */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Bouwjaar
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id={minBuildYearId}
                  type="number"
                  value={filters.minBuildYear}
                  onChange={(e) => update({ minBuildYear: e.target.value })}
                  placeholder="Van"
                  aria-label="Bouwjaar vanaf"
                  className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
                />
                <span className="hidden text-sm text-slate-300 sm:inline">–</span>
                <input
                  id={maxBuildYearId}
                  type="number"
                  value={filters.maxBuildYear}
                  onChange={(e) => update({ maxBuildYear: e.target.value })}
                  placeholder="Tot"
                  aria-label="Bouwjaar tot"
                  className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
                />
              </div>
            </div>

            {/* Sort */}
            <div className="mb-4">
              <label
                htmlFor={sortSelectId}
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Sorteren
              </label>
              <select
                id={sortSelectId}
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
            <label className="mb-1 flex cursor-pointer select-none items-center gap-2.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={filters.showRemoved}
                onChange={(e) => update({ showRemoved: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
              />
              Inclusief verkochte schepen
            </label>
          </div>

          {/* Sticky footer actions */}
          <div
            className={`border-t border-slate-100 bg-white ${
              mobileSheet ? "px-5 py-3" : "px-5 pb-5 pt-4"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
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
              <div className="flex items-center gap-2">
                {onSaveAsSearch && (
                  <button
                    type="button"
                    onClick={() => onSaveAsSearch(filters)}
                    className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100"
                  >
                    Opslaan
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Toon resultaten
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (mobileSheet) {
    if (!canUseDOM) return null;
    return createPortal(content, document.body);
  }

  return content;
}

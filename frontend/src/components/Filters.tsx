"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useOutsideClick } from "@/lib/useOutsideClick";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { formatPriceShort } from "@/lib/formatting";
import {
  PREFERRED_TYPES,
  MAX_VISIBLE_TYPES,
  PRICE_CFG,
  LENGTH_CFG,
  PRICE_PRESETS,
  LENGTH_PRESETS,
  fmtPriceFull,
} from "@/lib/filterConfig";
import RangePopover from "./filters/RangePopover";
import FiltersDropdown from "./filters/FiltersDropdown";
import ActiveChips from "./filters/ActiveChips";

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

/* ── Main Component ───────────────────────────────────────── */

interface FiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  availableTypes: string[];
  vesselCount: number;
  onSaveAsSearch?: (filters: FilterState) => void;
  hideChips?: boolean;
  onPopoverChange?: (open: boolean) => void;
}

export default function Filters({
  filters,
  onFilterChange,
  availableTypes,
  vesselCount,
  onSaveAsSearch,
  hideChips,
  onPopoverChange,
}: FiltersProps) {
  const [activePopover, setActivePopover] = useState<"meer" | "price" | "length" | "filters" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (partial: Partial<FilterState>) => {
      onFilterChange({ ...filters, ...partial });
    },
    [filters, onFilterChange],
  );

  /* Reorder types: preferred first, rest alphabetical */
  const orderedTypes = useMemo(() => {
    const preferred = PREFERRED_TYPES.filter((t) => availableTypes.includes(t));
    const rest = availableTypes.filter((t) => !PREFERRED_TYPES.includes(t)).sort();
    return [...preferred, ...rest];
  }, [availableTypes]);

  const visibleTypes = orderedTypes.slice(0, MAX_VISIBLE_TYPES);
  const meerTypes = orderedTypes.slice(MAX_VISIBLE_TYPES);

  function toggle(which: typeof activePopover) {
    setActivePopover((prev) => (prev === which ? null : which));
  }

  const closePopover = useCallback(() => setActivePopover(null), []);

  /* Close on outside click */
  useOutsideClick(barRef, closePopover, !!activePopover);

  /* Close on ESC */
  useEscapeKey(closePopover);

  /* Notify parent when popover opens/closes */
  useEffect(() => {
    onPopoverChange?.(activePopover !== null);
  }, [activePopover, onPopoverChange]);

  /* Extra filter badge count */
  const extraFilterCount = [
    filters.source,
    filters.search,
    filters.minTonnage || filters.maxTonnage,
    filters.minBuildYear || filters.maxBuildYear,
    filters.showRemoved,
    filters.sort && filters.sort !== "newest",
  ].filter(Boolean).length;

  const selectedTypeInMeer = filters.type && meerTypes.includes(filters.type);

  const hasAnyFilter = !!(
    filters.type || filters.source || filters.search ||
    filters.minPrice || filters.maxPrice ||
    filters.minLength || filters.maxLength ||
    filters.minTonnage || filters.maxTonnage ||
    filters.minBuildYear || filters.maxBuildYear ||
    filters.showRemoved
  );

  /* Trigger labels */
  const priceLabel = (() => {
    if (!filters.minPrice && !filters.maxPrice) return "Prijs";
    const min = filters.minPrice ? formatPriceShort(Number(filters.minPrice)) : "€0";
    const max = filters.maxPrice ? formatPriceShort(Number(filters.maxPrice)) : "";
    return max ? `${min} – ${max}` : `${min}+`;
  })();

  const lengthLabel = (() => {
    if (!filters.minLength && !filters.maxLength) return "Lengte";
    const min = filters.minLength || "0";
    const max = filters.maxLength || "";
    return max ? `${min} – ${max}m` : `${min}m+`;
  })();

  const hasPriceFilter = !!(filters.minPrice || filters.maxPrice);
  const hasLengthFilter = !!(filters.minLength || filters.maxLength);

  return (
    <div className="space-y-2">
      {/* Backdrop for modal-style popovers */}
      {(activePopover === "price" || activePopover === "length" || activePopover === "filters") && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
          onClick={closePopover}
        />
      )}

      <div ref={barRef} className="relative z-50">
        {/* ═══ Main filter bar ═══ */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-md ring-1 ring-gray-100">

          {/* ── Type pills ── */}
          {/* Outer wrapper is `relative` so the Meer dropdown can be positioned
              outside the overflow-hidden container and won't be clipped. */}
          <div className="relative flex min-w-0 items-center">
            <div className="flex min-w-0 items-center overflow-hidden rounded-xl bg-slate-100 p-1">
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TypePill active={!filters.type} onClick={() => update({ type: "" })}>
                  Alle
                </TypePill>
                {visibleTypes.map((t) => (
                  <TypePill
                    key={t}
                    active={filters.type === t}
                    onClick={() => update({ type: filters.type === t ? "" : t })}
                  >
                    {t}
                  </TypePill>
                ))}
              </div>

              {/* "Meer" button — inside bg container, shrink-0 so it stays visible */}
              {meerTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle("meer")}
                  className={`shrink-0 flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap ${
                    selectedTypeInMeer
                      ? "bg-white text-cyan-700 shadow-sm ring-1 ring-slate-200"
                      : activePopover === "meer"
                        ? "bg-white/80 text-slate-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                  }`}
                >
                  {selectedTypeInMeer ? filters.type : "Meer"}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* "Meer" dropdown — outside overflow-hidden so it won't be clipped */}
            {activePopover === "meer" && meerTypes.length > 0 && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
                {meerTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      update({ type: filters.type === t ? "" : t });
                      setActivePopover(null);
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-sm transition ${
                      filters.type === t
                        ? "bg-cyan-50 font-semibold text-cyan-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Separator ── */}
          <div className="hidden h-8 w-px bg-slate-200 sm:block" />

          {/* ── Price trigger ── */}
          <button
            type="button"
            onClick={() => toggle("price")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
              activePopover === "price"
                ? "border-cyan-400 bg-white text-cyan-700 shadow-md ring-2 ring-cyan-100"
                : hasPriceFilter
                  ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <span className="text-slate-400">€</span>
            {priceLabel === "Prijs" ? (
              <span className="text-slate-400">{priceLabel}</span>
            ) : (
              <span>{priceLabel}</span>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {/* ── Length trigger ── */}
          <button
            type="button"
            onClick={() => toggle("length")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
              activePopover === "length"
                ? "border-cyan-400 bg-white text-cyan-700 shadow-md ring-2 ring-cyan-100"
                : hasLengthFilter
                  ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <RulerIcon className="h-4 w-4 text-slate-400" />
            {lengthLabel === "Lengte" ? (
              <span className="text-slate-400">{lengthLabel}</span>
            ) : (
              <span>{lengthLabel}</span>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {/* ── Filters dropdown ── */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggle("filters")}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                activePopover === "filters" || extraFilterCount > 0
                  ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <SlidersIcon className="h-4 w-4" />
              Filters
              {extraFilterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-[10px] font-bold text-white">
                  {extraFilterCount}
                </span>
              )}
            </button>

          </div>

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Vessel count ── */}
          <span className="whitespace-nowrap text-sm font-semibold text-slate-500">
            {vesselCount} {vesselCount === 1 ? "schip" : "schepen"}
          </span>

          {/* ── Save search button ── */}
          {hasAnyFilter && onSaveAsSearch && (
            <button
              type="button"
              onClick={() => onSaveAsSearch(filters)}
              className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Zoekopdracht opslaan
            </button>
          )}
        </div>

        {/* ═══ Price popover ═══ */}
        {activePopover === "price" && (
          <RangePopover
            title="Wat is je budget?"
            cfg={PRICE_CFG}
            presets={PRICE_PRESETS}
            currentMin={filters.minPrice}
            currentMax={filters.maxPrice}
            formatLabel={formatPriceShort}
            formatDisplay={fmtPriceFull}
            onApply={(min, max) => update({ minPrice: min, maxPrice: max })}
            onClose={closePopover}
          />
        )}

        {/* ═══ Length popover ═══ */}
        {activePopover === "length" && (
          <RangePopover
            title="Welke scheepslengte?"
            cfg={LENGTH_CFG}
            presets={LENGTH_PRESETS}
            currentMin={filters.minLength}
            currentMax={filters.maxLength}
            formatLabel={(v) => `${v}m`}
            formatDisplay={(v) => `${v}m`}
            onApply={(min, max) => update({ minLength: min, maxLength: max })}
            onClose={closePopover}
          />
        )}

        {/* ═══ Filters popover ═══ */}
        {activePopover === "filters" && (
          <FiltersDropdown
            filters={filters}
            update={update}
            onSaveAsSearch={onSaveAsSearch}
            extraFilterCount={extraFilterCount}
            onClose={closePopover}
          />
        )}
      </div>

      {/* ═══ Active filter chips ═══ */}
      {!hideChips && <ActiveChips filters={filters} onClear={update} />}
    </div>
  );
}

/* ── Type Pill ────────────────────────────────────────────── */

function TypePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap ${
        active
          ? "bg-white text-cyan-700 shadow-sm ring-1 ring-slate-200"
          : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Icons ─────────────────────────────────────────────────── */

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function RulerIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l-3 3m3-3l3 3m-3-3v16m0 0l-3-3m3 3l3-3" />
    </svg>
  );
}

function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  );
}

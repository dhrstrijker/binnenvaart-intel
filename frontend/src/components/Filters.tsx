"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";

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

/* ── Constants ─────────────────────────────────────────────── */

const SOURCES = [
  { value: "", label: "Alle bronnen" },
  { value: "rensendriessen", label: "Rensen & Driessen" },
  { value: "galle", label: "Galle" },
  { value: "pcshipbrokers", label: "PC Shipbrokers" },
  { value: "gtsschepen", label: "GTS" },
  { value: "gsk", label: "GSK" },
];

const PREFERRED_TYPES = ["Motorvrachtschip", "Tankschip", "Beunschip"];
const MAX_VISIBLE_TYPES = 3;

const PRICE_CFG = { min: 0, max: 5_000_000, step: 25_000 };
const LENGTH_CFG = { min: 0, max: 200, step: 1 };

const PRICE_PRESETS = [
  { label: "Alle prijzen", min: 0, max: 5_000_000 },
  { label: "< €250K", min: 0, max: 250_000 },
  { label: "€250K – €500K", min: 250_000, max: 500_000 },
  { label: "€500K – €1M", min: 500_000, max: 1_000_000 },
  { label: "> €1M", min: 1_000_000, max: 5_000_000 },
];

const LENGTH_PRESETS = [
  { label: "Alle lengtes", min: 0, max: 200 },
  { label: "< 50m", min: 0, max: 50 },
  { label: "50 – 80m", min: 50, max: 80 },
  { label: "80 – 110m", min: 80, max: 110 },
  { label: "> 110m", min: 110, max: 200 },
];

/* ── Main Component ───────────────────────────────────────── */

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

  /* Close on outside click */
  useEffect(() => {
    if (!activePopover) return;
    function handleClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activePopover]);

  /* Close on ESC */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActivePopover(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

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

  /* Trigger labels */
  const priceLabel = (() => {
    if (!filters.minPrice && !filters.maxPrice) return "Prijs";
    const min = filters.minPrice ? fmtPriceCompact(Number(filters.minPrice)) : "€0";
    const max = filters.maxPrice ? fmtPriceCompact(Number(filters.maxPrice)) : "";
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
      {(activePopover === "price" || activePopover === "length") && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
          onClick={() => setActivePopover(null)}
        />
      )}

      <div ref={barRef} className="relative z-50">
        {/* ═══ Main filter bar ═══ */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-md ring-1 ring-gray-100">

          {/* ── Type pills ── */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
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

            {/* "Meer" dropdown trigger */}
            {meerTypes.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggle("meer")}
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap ${
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

                {activePopover === "meer" && (
                  <div className="absolute left-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
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

            {activePopover === "filters" && (
              <FiltersDropdown
                filters={filters}
                update={update}
                user={user}
                onSaveAsSearch={onSaveAsSearch}
                onAuthPrompt={onAuthPrompt}
                extraFilterCount={extraFilterCount}
                onClose={() => setActivePopover(null)}
              />
            )}
          </div>

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Vessel count ── */}
          <span className="whitespace-nowrap text-sm font-semibold text-slate-500">
            {vesselCount} {vesselCount === 1 ? "schip" : "schepen"}
          </span>
        </div>

        {/* ═══ Price popover ═══ */}
        {activePopover === "price" && (
          <RangePopover
            title="Wat is je budget?"
            cfg={PRICE_CFG}
            presets={PRICE_PRESETS}
            currentMin={filters.minPrice}
            currentMax={filters.maxPrice}
            formatLabel={fmtPriceCompact}
            formatDisplay={fmtPriceFull}
            onApply={(min, max) => update({ minPrice: min, maxPrice: max })}
            onClose={() => setActivePopover(null)}
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
            onClose={() => setActivePopover(null)}
          />
        )}
      </div>

      {/* ═══ Active filter chips ═══ */}
      <ActiveChips filters={filters} onClear={update} />
    </div>
  );
}

/* ── Range Popover (Airbnb-style) ─────────────────────────── */

function RangePopover({
  title,
  cfg,
  presets,
  currentMin,
  currentMax,
  formatLabel,
  formatDisplay,
  onApply,
  onClose,
}: {
  title: string;
  cfg: { min: number; max: number; step: number };
  presets: { label: string; min: number; max: number }[];
  currentMin: string;
  currentMax: string;
  formatLabel: (v: number) => string;
  formatDisplay: (v: number) => string;
  onApply: (min: string, max: string) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<[number, number]>([
    currentMin ? Number(currentMin) : cfg.min,
    currentMax ? Number(currentMax) : cfg.max,
  ]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyValues(v: [number, number]) {
    setValues(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onApply(
        v[0] === cfg.min ? "" : String(v[0]),
        v[1] === cfg.max ? "" : String(v[1]),
      );
    }, 200);
  }

  function handlePreset(preset: { min: number; max: number }) {
    const v: [number, number] = [preset.min, preset.max];
    setValues(v);
    onApply(
      v[0] === cfg.min ? "" : String(v[0]),
      v[1] === cfg.max ? "" : String(v[1]),
    );
  }

  function handleClear() {
    setValues([cfg.min, cfg.max]);
    onApply("", "");
    onClose();
  }

  const isDefault = values[0] === cfg.min && values[1] === cfg.max;

  return (
    <div className="absolute left-1/2 top-full z-50 mt-3 w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      {/* Title */}
      <h3 className="mb-5 text-center text-base font-semibold text-slate-800">
        {title}
      </h3>

      {/* Slider */}
      <div className="mb-4 px-2">
        <DualRangeSlider
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          values={values}
          onChange={applyValues}
          formatLabel={formatLabel}
        />
      </div>

      {/* Current range display */}
      <div className="mb-5 text-center">
        <span className="inline-block rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
          {isDefault
            ? "Alle"
            : `${formatDisplay(values[0])} – ${formatDisplay(values[1])}`}
        </span>
      </div>

      {/* Presets */}
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {presets.map((p) => {
          const active = values[0] === p.min && values[1] === p.max;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePreset(p)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={handleClear}
          className={`text-sm font-medium transition ${
            isDefault ? "text-slate-300 cursor-default" : "text-slate-500 underline hover:text-slate-700"
          }`}
          disabled={isDefault}
        >
          Wis filters
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Toon resultaten
        </button>
      </div>
    </div>
  );
}

/* ── Dual Range Slider ────────────────────────────────────── */

function DualRangeSlider({
  min,
  max,
  step,
  values,
  onChange,
  formatLabel,
}: {
  min: number;
  max: number;
  step: number;
  values: [number, number];
  onChange: (v: [number, number]) => void;
  formatLabel: (v: number) => string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"min" | "max" | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const snap = (raw: number) => Math.max(min, Math.min(max, Math.round(raw / step) * step));

  const handleMove = useCallback(
    (clientX: number) => {
      if (!trackRef.current || !draggingRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + fraction * (max - min);
      const snapped = snap(raw);
      const cur = valuesRef.current;

      let next: [number, number];
      if (draggingRef.current === "min") {
        next = [Math.min(snapped, cur[1] - step), cur[1]];
      } else {
        next = [cur[0], Math.max(snapped, cur[0] + step)];
      }
      valuesRef.current = next;
      onChange(next);
    },
    [min, max, step, onChange],
  );

  useEffect(() => {
    if (!draggingRef.current) return;

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientX);
    };
    const onUp = () => { draggingRef.current = null; };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  });

  function startDrag(thumb: "min" | "max") {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      draggingRef.current = thumb;
    };
  }

  function handleTrackClick(e: React.MouseEvent) {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const raw = min + fraction * (max - min);
    const snapped = snap(raw);
    const distToMin = Math.abs(snapped - values[0]);
    const distToMax = Math.abs(snapped - values[1]);
    if (distToMin <= distToMax) {
      onChange([Math.min(snapped, values[1] - step), values[1]]);
    } else {
      onChange([values[0], Math.max(snapped, values[0] + step)]);
    }
  }

  return (
    <div className="py-3">
      {/* Edge labels */}
      <div className="mb-2 flex justify-between text-xs text-slate-400">
        <span>{formatLabel(min)}</span>
        <span>{formatLabel(max)}</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-2 cursor-pointer rounded-full bg-slate-200"
        onClick={handleTrackClick}
      >
        {/* Active range fill */}
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-500"
          style={{
            left: `${pct(values[0])}%`,
            width: `${pct(values[1]) - pct(values[0])}%`,
          }}
        />

        {/* Min thumb */}
        <div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-cyan-500 bg-white shadow-md transition-transform hover:scale-110 active:scale-110 active:cursor-grabbing"
          style={{ left: `${pct(values[0])}%` }}
          onMouseDown={startDrag("min")}
          onTouchStart={startDrag("min")}
        />

        {/* Max thumb */}
        <div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-cyan-500 bg-white shadow-md transition-transform hover:scale-110 active:scale-110 active:cursor-grabbing"
          style={{ left: `${pct(values[1])}%` }}
          onMouseDown={startDrag("max")}
          onTouchStart={startDrag("max")}
        />
      </div>
    </div>
  );
}

/* ── Filters Dropdown ─────────────────────────────────────── */

function FiltersDropdown({
  filters,
  update,
  user,
  onSaveAsSearch,
  onAuthPrompt,
  extraFilterCount,
  onClose,
}: {
  filters: FilterState;
  update: (partial: Partial<FilterState>) => void;
  user?: User | null;
  onSaveAsSearch?: (filters: FilterState) => void;
  onAuthPrompt?: () => void;
  extraFilterCount: number;
  onClose: () => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateDebounced(partial: Partial<FilterState>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update(partial), 200);
  }

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
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

/* ── Active Filter Chips ──────────────────────────────────── */

function ActiveChips({
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
    const min = filters.minPrice ? fmtPriceCompact(Number(filters.minPrice)) : "";
    const max = filters.maxPrice ? fmtPriceCompact(Number(filters.maxPrice)) : "";
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

/* ── Helpers ───────────────────────────────────────────────── */

function fmtPriceCompact(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `€${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (v >= 1_000) return `€${Math.round(v / 1_000)}K`;
  return `€${v}`;
}

function fmtPriceFull(v: number): string {
  return `€ ${v.toLocaleString("nl-NL")}`;
}

function rangeLabel(min: string, max: string, unit: string): string {
  if (min && max) return `${min}${unit} – ${max}${unit}`;
  if (min) return `${min}${unit}+`;
  if (max) return `tot ${max}${unit}`;
  return "";
}

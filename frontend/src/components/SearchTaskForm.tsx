"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildSavedSearchQuery } from "@/lib/savedSearchQuery";
import {
  SavedSearch,
  SavedSearchFilters,
  SOURCE_OPTIONS,
  COMMON_TYPES,
} from "@/lib/savedSearchTypes";
import type { User } from "@supabase/supabase-js";

interface VesselPreview {
  id: string;
  name: string;
  type: string | null;
  price: number | null;
  image_url: string | null;
  source: string;
}

interface SearchTaskFormProps {
  user: User;
  existingSearch?: SavedSearch | null;
  availableTypes: string[];
  onSave: () => void;
  onCancel: () => void;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

const labelClass = "block text-xs font-medium text-slate-600";

export default function SearchTaskForm({
  user,
  existingSearch,
  availableTypes,
  onSave,
  onCancel,
}: SearchTaskFormProps) {
  const [name, setName] = useState(existingSearch?.name ?? "");
  const [frequency, setFrequency] = useState<"immediate" | "daily" | "weekly">(
    existingSearch?.frequency ?? "daily"
  );
  const [filters, setFilters] = useState<SavedSearchFilters>(
    existingSearch?.filters ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [previews, setPreviews] = useState<VesselPreview[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isEdit = !!existingSearch?.id;

  // Merge types: DB types + COMMON_TYPES
  const allTypes = Array.from(new Set([...availableTypes, ...COMMON_TYPES])).sort();

  function updateFilter(partial: Partial<SavedSearchFilters>) {
    setFilters((prev) => ({ ...prev, ...partial }));
  }

  // Live preview with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const query = buildSavedSearchQuery(filters);
        const { count, data } = await query.order("first_seen_at", { ascending: false }).limit(6);
        setMatchCount(count ?? 0);
        setPreviews((data as VesselPreview[]) ?? []);
      } catch {
        setMatchCount(null);
        setPreviews([]);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters]);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    // Strip empty string values from filters
    const cleanFilters: SavedSearchFilters = {};
    for (const [key, val] of Object.entries(filters)) {
      if (val) (cleanFilters as Record<string, string>)[key] = val;
    }

    let saveError;
    if (isEdit) {
      ({ error: saveError } = await supabase
        .from("saved_searches")
        .update({ name: name.trim(), filters: cleanFilters, frequency })
        .eq("id", existingSearch!.id));
    } else {
      ({ error: saveError } = await supabase.from("saved_searches").insert({
        user_id: user.id,
        name: name.trim(),
        filters: cleanFilters,
        frequency,
        active: true,
      }));
    }

    setSaving(false);
    if (saveError) {
      setError("Opslaan mislukt. Probeer het opnieuw.");
      return;
    }
    onSave();
  }

  function formatPrice(price: number | null): string {
    if (price === null) return "Prijs op aanvraag";
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  }

  return (
    <div className="rounded-xl bg-white shadow-md ring-1 ring-gray-100 p-5">
      <h3 className="text-base font-semibold text-slate-900">
        {isEdit ? "Zoekopdracht bewerken" : "Nieuwe zoekopdracht"}
      </h3>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column — Form fields */}
        <div className="space-y-3">
          {/* Name */}
          <div>
            <label className={labelClass}>Naam *</label>
            <input
              type="text"
              placeholder="Bijv. Motorvrachtschepen onder €100k"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Text search */}
          <div>
            <label className={labelClass}>Zoek op scheepsnaam</label>
            <input
              type="text"
              placeholder="Bijv. De Hoop"
              value={filters.search ?? ""}
              onChange={(e) => updateFilter({ search: e.target.value })}
              className={inputClass}
            />
          </div>

          {/* Type + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <select
                value={filters.type ?? ""}
                onChange={(e) => updateFilter({ type: e.target.value })}
                className={inputClass}
              >
                <option value="">Alle types</option>
                {allTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Bron</label>
              <select
                value={filters.source ?? ""}
                onChange={(e) => updateFilter({ source: e.target.value })}
                className={inputClass}
              >
                <option value="">Alle bronnen</option>
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Price range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Min prijs (€)</label>
              <input
                type="number"
                placeholder="0"
                value={filters.minPrice ?? ""}
                onChange={(e) => updateFilter({ minPrice: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max prijs (€)</label>
              <input
                type="number"
                placeholder="Onbeperkt"
                value={filters.maxPrice ?? ""}
                onChange={(e) => updateFilter({ maxPrice: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          {/* Length range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Min lengte (m)</label>
              <input
                type="number"
                placeholder="0"
                value={filters.minLength ?? ""}
                onChange={(e) => updateFilter({ minLength: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max lengte (m)</label>
              <input
                type="number"
                placeholder="Onbeperkt"
                value={filters.maxLength ?? ""}
                onChange={(e) => updateFilter({ maxLength: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          {/* Width range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Min breedte (m)</label>
              <input
                type="number"
                placeholder="0"
                value={filters.minWidth ?? ""}
                onChange={(e) => updateFilter({ minWidth: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max breedte (m)</label>
              <input
                type="number"
                placeholder="Onbeperkt"
                value={filters.maxWidth ?? ""}
                onChange={(e) => updateFilter({ maxWidth: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          {/* Build year range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Min bouwjaar</label>
              <input
                type="number"
                placeholder="Bijv. 1980"
                value={filters.minBuildYear ?? ""}
                onChange={(e) => updateFilter({ minBuildYear: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max bouwjaar</label>
              <input
                type="number"
                placeholder="Bijv. 2024"
                value={filters.maxBuildYear ?? ""}
                onChange={(e) => updateFilter({ maxBuildYear: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          {/* Tonnage range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Min tonnage</label>
              <input
                type="number"
                placeholder="0"
                value={filters.minTonnage ?? ""}
                onChange={(e) => updateFilter({ minTonnage: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max tonnage</label>
              <input
                type="number"
                placeholder="Onbeperkt"
                value={filters.maxTonnage ?? ""}
                onChange={(e) => updateFilter({ maxTonnage: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className={labelClass}>Meldingsfrequentie</label>
            <select
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as "immediate" | "daily" | "weekly")
              }
              className={inputClass}
            >
              <option value="immediate">Direct</option>
              <option value="daily">Dagelijks</option>
              <option value="weekly">Wekelijks</option>
            </select>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || saving}
              className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
            >
              {saving ? "Opslaan..." : isEdit ? "Bijwerken" : "Opslaan"}
            </button>
            <button
              onClick={onCancel}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Annuleren
            </button>
          </div>
        </div>

        {/* Right column — Live preview */}
        <div className="hidden lg:block">
          <div className="sticky top-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-700">Live preview</h4>

            {matchCount !== null ? (
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {matchCount}{" "}
                <span className="text-base font-normal text-slate-500">
                  {matchCount === 1 ? "schip gevonden" : "schepen gevonden"}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Laden...</p>
            )}

            {/* Mini vessel grid */}
            {previews.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {previews.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-lg bg-white p-2 ring-1 ring-gray-100"
                  >
                    {v.image_url ? (
                      <img
                        src={v.image_url}
                        alt={v.name}
                        className="h-16 w-full rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-full items-center justify-center rounded bg-slate-100">
                        <svg
                          className="h-6 w-6 text-slate-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5z"
                          />
                        </svg>
                      </div>
                    )}
                    <p className="mt-1 truncate text-xs font-medium text-slate-700">
                      {v.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {v.type ?? ""} {v.price !== null ? `· ${formatPrice(v.price)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {matchCount === 0 && (
              <p className="mt-4 text-sm text-slate-400">
                Geen schepen matchen deze filters. Pas je criteria aan.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

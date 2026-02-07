"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import PremiumGate from "@/components/PremiumGate";

interface SavedSearchFilters {
  type?: string;
  source?: string;
  minPrice?: string;
  maxPrice?: string;
}

interface SavedSearch {
  id: string;
  name: string;
  filters: SavedSearchFilters;
  frequency: "immediate" | "daily" | "weekly";
  active: boolean;
  created_at: string;
}

interface SavedSearchManagerProps {
  user: User;
  isPremium: boolean;
}

const sourceLabels: Record<string, string> = {
  rensendriessen: "Rensen & Driessen",
  galle: "Galle Makelaars",
  pcshipbrokers: "PC Shipbrokers",
  gtsschepen: "GTS Schepen",
  gsk: "GSK Brokers",
};

const frequencyLabels: Record<string, string> = {
  immediate: "Direct",
  daily: "Dagelijks",
  weekly: "Wekelijks",
};

const COMMON_TYPES = [
  "Motorvrachtschip",
  "Duwbak",
  "Motortankschip",
  "Sleepboot",
  "Beurtschip",
  "Passagiersschip",
  "Overig",
];

const MAX_FREE_SEARCHES = 2;

export default function SavedSearchManager({ user, isPremium }: SavedSearchManagerProps) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [frequency, setFrequency] = useState<"immediate" | "daily" | "weekly">("daily");

  useEffect(() => {
    loadSearches();
  }, [user.id]);

  async function loadSearches() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setSearches(data);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!name.trim()) return;

    setSaving(true);
    const supabase = createClient();

    const filters: SavedSearchFilters = {};
    if (type) filters.type = type;
    if (source) filters.source = source;
    if (minPrice) filters.minPrice = minPrice;
    if (maxPrice) filters.maxPrice = maxPrice;

    const { error } = await supabase.from("saved_searches").insert({
      user_id: user.id,
      name: name.trim(),
      filters,
      frequency,
      active: true,
    });

    setSaving(false);
    if (!error) {
      // Reset form
      setName("");
      setType("");
      setSource("");
      setMinPrice("");
      setMaxPrice("");
      setFrequency("daily");
      setShowForm(false);
      loadSearches();
    }
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("saved_searches").delete().eq("id", id);
    if (!error) {
      loadSearches();
    }
  }

  function getFilterSummary(filters: SavedSearchFilters): string {
    const parts: string[] = [];
    if (filters.type) parts.push(filters.type);
    if (filters.source) parts.push(sourceLabels[filters.source] || filters.source);
    if (filters.minPrice) parts.push(`Min €${parseInt(filters.minPrice).toLocaleString("nl-NL")}`);
    if (filters.maxPrice) parts.push(`Max €${parseInt(filters.maxPrice).toLocaleString("nl-NL")}`);
    return parts.length > 0 ? parts.join(" · ") : "Alle schepen";
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
          <span className="text-sm text-slate-400">Zoekopdrachten laden...</span>
        </div>
      </div>
    );
  }

  const canAddSearch = isPremium || searches.length < MAX_FREE_SEARCHES;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Opgeslagen zoekopdrachten
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {searches.length === 0
              ? "Maak aangepaste zoekopdrachten en ontvang meldingen bij nieuwe matches."
              : `${searches.length} ${searches.length === 1 ? "zoekopdracht" : "zoekopdrachten"} actief`}
          </p>
        </div>
        {canAddSearch ? (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
          >
            {showForm ? "Annuleren" : "+ Nieuwe zoekopdracht"}
          </button>
        ) : (
          <PremiumGate isPremium={isPremium}>
            <span className="text-sm text-slate-500">Upgrade naar Pro voor onbeperkte zoekopdrachten</span>
          </PremiumGate>
        )}
      </div>

      {/* Creation form */}
      {showForm && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Nieuwe zoekopdracht</h3>

          <div className="mt-3 space-y-3">
            {/* Name input */}
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Naam
              </label>
              <input
                type="text"
                placeholder="Bijv. Motorvrachtschepen onder €100k"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </div>

            {/* Filter fields */}
            <div className="grid grid-cols-2 gap-3">
              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">Alle types</option>
                  {COMMON_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Source */}
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Bron
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
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
                <label className="block text-xs font-medium text-slate-600">
                  Min prijs (€)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              {/* Max price */}
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Max prijs (€)
                </label>
                <input
                  type="number"
                  placeholder="Onbeperkt"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Meldingsfrequentie
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as "immediate" | "daily" | "weekly")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="immediate">Direct</option>
                <option value="daily">Dagelijks</option>
                <option value="weekly">Wekelijks</option>
              </select>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCreate}
                disabled={!name.trim() || saving}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
              >
                {saving ? "Opslaan..." : "Opslaan"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List of saved searches */}
      {searches.length === 0 && !showForm ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-500">
            Je hebt nog geen opgeslagen zoekopdrachten.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {searches.map((search) => (
            <div
              key={search.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-300"
            >
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-slate-800">{search.name}</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {getFilterSummary(search.filters)} · {frequencyLabels[search.frequency]}
                </p>
              </div>
              <button
                onClick={() => handleDelete(search.id)}
                className="ml-4 rounded px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                Verwijderen
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

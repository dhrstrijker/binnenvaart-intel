"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildSavedSearchQuery } from "@/lib/savedSearchQuery";
import {
  SavedSearch,
  SavedSearchFilters,
  MAX_FREE_SEARCHES,
} from "@/lib/savedSearchTypes";
import SearchTaskCard from "./SearchTaskCard";
import SearchTaskForm from "./SearchTaskForm";
import PremiumGate from "./PremiumGate";
import type { User } from "@supabase/supabase-js";

interface SearchTaskPageProps {
  user: User;
  isPremium: boolean;
}

export default function SearchTaskPage({ user, isPremium }: SearchTaskPageProps) {
  const searchParams = useSearchParams();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);

  useEffect(() => {
    loadData();
  }, [user.id]);

  // Handle URL prefill
  useEffect(() => {
    if (searchParams.get("prefill") === "1") {
      const prefillFilters: SavedSearchFilters = {};
      if (searchParams.get("type")) prefillFilters.type = searchParams.get("type")!;
      if (searchParams.get("source")) prefillFilters.source = searchParams.get("source")!;
      if (searchParams.get("minPrice")) prefillFilters.minPrice = searchParams.get("minPrice")!;
      if (searchParams.get("maxPrice")) prefillFilters.maxPrice = searchParams.get("maxPrice")!;
      if (searchParams.get("search")) prefillFilters.search = searchParams.get("search")!;

      setEditingSearch(null);
      setShowForm(true);

      // Create a temporary "fake" search with prefilled filters so the form picks them up
      // We handle this by passing it as existingSearch=null but with prefill
      // Actually, let's use a different approach: store prefill filters in state
      setPrefillFilters(prefillFilters);
    }
  }, [searchParams]);

  const [prefillFilters, setPrefillFilters] = useState<SavedSearchFilters | null>(null);

  async function loadData() {
    setLoading(true);
    const supabase = createClient();

    // Load saved searches
    const { data: searchData } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const loadedSearches = (searchData as SavedSearch[]) ?? [];
    setSearches(loadedSearches);

    // Load available types
    const { data: typeData } = await supabase
      .from("vessels")
      .select("type")
      .not("type", "is", null)
      .is("canonical_vessel_id", null);

    if (typeData) {
      const types = Array.from(new Set(typeData.map((r) => r.type as string).filter(Boolean)));
      setAvailableTypes(types.sort());
    }

    // Load match counts for all searches
    const counts: Record<string, number> = {};
    await Promise.all(
      loadedSearches.map(async (s) => {
        try {
          const { count } = await buildSavedSearchQuery(s.filters)
            .limit(0);
          counts[s.id] = count ?? 0;
        } catch {
          counts[s.id] = 0;
        }
      })
    );
    setMatchCounts(counts);

    setLoading(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    await supabase.from("saved_searches").delete().eq("id", id);
    loadData();
  }

  async function handleToggleActive(id: string, active: boolean) {
    const supabase = createClient();
    await supabase.from("saved_searches").update({ active }).eq("id", id);
    setSearches((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active } : s))
    );
  }

  function handleEdit(search: SavedSearch) {
    setPrefillFilters(null);
    setEditingSearch(search);
    setShowForm(true);
  }

  function handleSave() {
    setShowForm(false);
    setEditingSearch(null);
    setPrefillFilters(null);
    loadData();
  }

  function handleCancel() {
    setShowForm(false);
    setEditingSearch(null);
    setPrefillFilters(null);
  }

  function handleNewSearch(prefill?: SavedSearchFilters) {
    setEditingSearch(null);
    setPrefillFilters(prefill ?? null);
    setShowForm(true);
  }

  const canAddSearch = isPremium || searches.length < MAX_FREE_SEARCHES;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
      </div>
    );
  }

  // Build a temporary SavedSearch for prefilled form (create mode with pre-filled filters)
  const formExistingSearch = editingSearch
    ? editingSearch
    : prefillFilters
      ? ({
          id: "",
          user_id: user.id,
          name: "",
          filters: prefillFilters,
          frequency: "daily" as const,
          active: true,
          created_at: "",
        } satisfies SavedSearch)
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Zoekopdrachten</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sla filtercriteria op en ontvang meldingen bij nieuwe schepen die matchen.
          </p>
        </div>
        {!showForm && (
          canAddSearch ? (
            <button
              onClick={() => handleNewSearch()}
              className="flex-shrink-0 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
            >
              + Nieuwe zoekopdracht
            </button>
          ) : (
            <PremiumGate isPremium={isPremium}>
              <span />
            </PremiumGate>
          )
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mt-6">
          <SearchTaskForm
            user={user}
            existingSearch={editingSearch ? editingSearch : prefillFilters ? formExistingSearch : null}
            availableTypes={availableTypes}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {/* Empty state */}
      {searches.length === 0 && !showForm && (
        <div className="mt-10 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-100">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-cyan-50">
            <svg
              className="h-8 w-8 text-cyan-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            Maak je eerste zoekopdracht
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Stel filters in en ontvang automatisch meldingen wanneer er nieuwe
            schepen verschijnen die aan je criteria voldoen.
          </p>

          {/* Quick-start buttons */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() =>
                handleNewSearch({ type: "Motorvrachtschip", maxPrice: "100000" })
              }
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Motorvrachtschepen onder €100k
            </button>
            <button
              onClick={() => handleNewSearch({ type: "Tankschip" })}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Alle tankschepen
            </button>
            <button
              onClick={() => handleNewSearch({ minLength: "50" })}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Schepen &gt; 50m
            </button>
          </div>
        </div>
      )}

      {/* Search cards grid */}
      {searches.length > 0 && !showForm && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {searches.map((search) => (
            <SearchTaskCard
              key={search.id}
              search={search}
              matchCount={matchCounts[search.id] ?? null}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  SavedSearch,
  SavedSearchFilters,
  MAX_FREE_SEARCHES,
  generateSearchName,
} from "@/lib/savedSearchTypes";
import type { User } from "@supabase/supabase-js";

function stableFilterKey(filters: SavedSearchFilters): string {
  const normalized = Object.keys(filters)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      const value = (filters as Record<string, string | undefined>)[key];
      if (value) acc[key] = value;
      return acc;
    }, {});
  return JSON.stringify(normalized);
}

export function useSavedSearches(user: User | null, isPremium: boolean) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(false);

  const activeCount = searches.filter((s) => s.active).length;
  const canAddSearch = isPremium || searches.length < MAX_FREE_SEARCHES;

  const refresh = useCallback(async () => {
    if (!user) {
      setSearches([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("saved_searches")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!error) {
        setSearches((data as SavedSearch[]) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveSearch = useCallback(
    async (
      filters: SavedSearchFilters,
      userId: string
    ): Promise<{ success: boolean; error?: string }> => {
      const supabase = createClient();

      // Strip empty string values
      const cleanFilters: SavedSearchFilters = {};
      for (const [key, val] of Object.entries(filters)) {
        if (val) (cleanFilters as Record<string, string>)[key] = val;
      }

      // Check for duplicate filters
      const filterStr = stableFilterKey(cleanFilters);
      const isDuplicate = searches.some(
        (s) => stableFilterKey(s.filters) === filterStr
      );
      if (isDuplicate) {
        return { success: false, error: "Je hebt deze zoekopdracht al opgeslagen" };
      }

      // Check limit
      if (!isPremium && searches.length >= MAX_FREE_SEARCHES) {
        return { success: false, error: "Upgrade naar Pro voor meer zoekopdrachten" };
      }

      const name = generateSearchName(cleanFilters);

      const { error } = await supabase.from("saved_searches").insert({
        user_id: userId,
        name,
        filters: cleanFilters,
        frequency: "immediate",
        active: true,
      });

      if (error) {
        return { success: false, error: "Opslaan mislukt. Probeer het opnieuw." };
      }

      await refresh();
      return { success: true };
    },
    [searches, isPremium, refresh]
  );

  const deleteSearch = useCallback(
    async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("saved_searches").delete().eq("id", id);
      if (!error) {
        setSearches((prev) => prev.filter((s) => s.id !== id));
      }
    },
    []
  );

  const toggleActive = useCallback(
    async (id: string, active: boolean) => {
      const supabase = createClient();
      const { error } = await supabase.from("saved_searches").update({ active }).eq("id", id);
      if (!error) {
        setSearches((prev) =>
          prev.map((s) => (s.id === id ? { ...s, active } : s))
        );
      }
    },
    []
  );

  return {
    searches,
    loading,
    activeCount,
    saveSearch,
    deleteSearch,
    toggleActive,
    refresh,
    canAddSearch,
  };
}

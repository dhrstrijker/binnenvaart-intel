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
    const { data } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSearches((data as SavedSearch[]) ?? []);
    setLoading(false);
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
      const filterStr = JSON.stringify(cleanFilters);
      const isDuplicate = searches.some(
        (s) => JSON.stringify(s.filters) === filterStr
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
      await supabase.from("saved_searches").delete().eq("id", id);
      setSearches((prev) => prev.filter((s) => s.id !== id));
    },
    []
  );

  const toggleActive = useCallback(
    async (id: string, active: boolean) => {
      const supabase = createClient();
      await supabase.from("saved_searches").update({ active }).eq("id", id);
      setSearches((prev) =>
        prev.map((s) => (s.id === id ? { ...s, active } : s))
      );
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

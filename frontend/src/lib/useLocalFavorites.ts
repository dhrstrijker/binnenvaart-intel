"use client";

import { useState, useEffect, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY = "navisio_favorites";

function readStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStorage(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage full or unavailable
  }
}

export function useLocalFavorites() {
  const [localFavorites, setLocalFavorites] = useState<string[]>([]);

  useEffect(() => {
    setLocalFavorites(readStorage());
  }, []);

  const addLocal = useCallback((vesselId: string) => {
    setLocalFavorites((prev) => {
      if (prev.includes(vesselId)) return prev;
      const next = [...prev, vesselId];
      writeStorage(next);
      return next;
    });
  }, []);

  const removeLocal = useCallback((vesselId: string) => {
    setLocalFavorites((prev) => {
      const next = prev.filter((id) => id !== vesselId);
      writeStorage(next);
      return next;
    });
  }, []);

  const isLocalFav = useCallback(
    (vesselId: string) => localFavorites.includes(vesselId),
    [localFavorites]
  );

  const clearLocal = useCallback(() => {
    setLocalFavorites([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const migrateToSupabase = useCallback(
    async (supabase: SupabaseClient, userId: string) => {
      const ids = readStorage();
      if (ids.length === 0) return;

      const rows = ids.map((vesselId) => ({
        user_id: userId,
        vessel_id: vesselId,
      }));

      // upsert to avoid conflicts with existing favorites
      await supabase.from("favorites").upsert(rows, {
        onConflict: "user_id,vessel_id",
        ignoreDuplicates: true,
      });

      clearLocal();
    },
    [clearLocal]
  );

  return { localFavorites, addLocal, removeLocal, isLocalFav, clearLocal, migrateToSupabase };
}

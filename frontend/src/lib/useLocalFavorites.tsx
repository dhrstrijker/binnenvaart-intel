"use client";

import { useState, useEffect, useCallback, useContext, createContext } from "react";
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

interface LocalFavoritesContextValue {
  localFavorites: string[];
  addLocal: (vesselId: string) => void;
  removeLocal: (vesselId: string) => void;
  isLocalFav: (vesselId: string) => boolean;
  clearLocal: () => void;
  migrateToSupabase: (supabase: SupabaseClient, userId: string) => Promise<void>;
}

const LocalFavoritesContext = createContext<LocalFavoritesContextValue | null>(null);

export function LocalFavoritesProvider({ children }: { children: React.ReactNode }) {
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

  return (
    <LocalFavoritesContext.Provider value={{ localFavorites, addLocal, removeLocal, isLocalFav, clearLocal, migrateToSupabase }}>
      {children}
    </LocalFavoritesContext.Provider>
  );
}

export function useLocalFavorites() {
  const ctx = useContext(LocalFavoritesContext);
  if (!ctx) {
    throw new Error("useLocalFavorites must be used within a LocalFavoritesProvider");
  }
  return ctx;
}

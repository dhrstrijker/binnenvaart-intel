"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocalFavorites } from "@/lib/useLocalFavorites";
import type { User } from "@supabase/supabase-js";

interface FavoriteButtonProps {
  vesselId: string;
  user: User | null;
  className?: string;
}

export default function FavoriteButton({ vesselId, user, className }: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const { isLocalFav, addLocal, removeLocal, migrateToSupabase } = useLocalFavorites();

  // Check Supabase favorite status for logged-in users
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("vessel_id", vesselId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIsFavorite(true);
      });
  }, [user, vesselId]);

  // Migrate local favorites to Supabase when user logs in
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    migrateToSupabase(supabase, user.id);
  }, [user, migrateToSupabase]);

  const isActive = user ? isFavorite : isLocalFav(vesselId);

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Anonymous: toggle local favorite (no auth required)
      if (!user) {
        if (isLocalFav(vesselId)) {
          removeLocal(vesselId);
        } else {
          addLocal(vesselId);
        }
        return;
      }

      if (loading) return;

      const prev = isFavorite;
      setIsFavorite(!prev);
      setLoading(true);

      const supabase = createClient();
      try {
        if (prev) {
          const { error } = await supabase
            .from("favorites")
            .delete()
            .eq("user_id", user.id)
            .eq("vessel_id", vesselId);
          if (error) setIsFavorite(prev);
        } else {
          const { error } = await supabase
            .from("favorites")
            .insert({ user_id: user.id, vessel_id: vesselId });
          if (error) setIsFavorite(prev);
        }
      } catch {
        setIsFavorite(prev);
      }
      setLoading(false);
    },
    [user, vesselId, isFavorite, loading, isLocalFav, addLocal, removeLocal]
  );

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={className ?? "flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-red-500 disabled:opacity-50"}
      title={!user ? "Bewaar als favoriet" : isActive ? "Verwijderen uit favorieten" : "Bewaar als favoriet"}
    >
      {isActive ? (
        <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      )}
    </button>
  );
}

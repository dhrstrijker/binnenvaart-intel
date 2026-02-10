"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationModal } from "@/lib/NotificationModalContext";
import { useWatchlistCount } from "@/lib/WatchlistContext";
import type { User } from "@supabase/supabase-js";

interface WatchlistButtonProps {
  vesselId: string;
  user: User | null;
  className?: string;
  onToggle?: (vesselId: string, isWatched: boolean) => void;
  /** Pre-fetched watchlist status from batch query. Skips per-card fetch when provided. */
  initialIsWatched?: boolean;
}

export default function WatchlistButton({ vesselId, user, className, onToggle, initialIsWatched }: WatchlistButtonProps) {
  const [isWatched, setIsWatched] = useState(initialIsWatched ?? false);
  const [loading, setLoading] = useState(false);
  const [animating, setAnimating] = useState(false);
  const { openNotificationModal } = useNotificationModal();
  const { bumpCount } = useWatchlistCount();

  // Sync with batch-provided value when it changes
  useEffect(() => {
    if (initialIsWatched !== undefined) setIsWatched(initialIsWatched);
  }, [initialIsWatched]);

  // Fallback: check Supabase per-card only when no batch data provided (e.g. detail page)
  useEffect(() => {
    if (initialIsWatched !== undefined) return;
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("watchlist")
      .select("id")
      .eq("user_id", user.id)
      .eq("vessel_id", vesselId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIsWatched(true);
      });
  }, [user, vesselId, initialIsWatched]);

  const doToggle = useCallback(
    async (currentUser: User) => {
      if (loading) return;

      const prev = isWatched;
      setIsWatched(!prev);
      setLoading(true);

      const supabase = createClient();
      try {
        if (prev) {
          const { error } = await supabase
            .from("watchlist")
            .delete()
            .eq("user_id", currentUser.id)
            .eq("vessel_id", vesselId);
          if (error) {
            setIsWatched(prev);
          } else {
            bumpCount(-1);
            onToggle?.(vesselId, false);
          }
        } else {
          const { error } = await supabase
            .from("watchlist")
            .insert({ user_id: currentUser.id, vessel_id: vesselId });
          if (error) {
            setIsWatched(prev);
          } else {
            bumpCount(1);
            onToggle?.(vesselId, true);
          }
        }
      } catch {
        setIsWatched(prev);
      }
      setLoading(false);
    },
    [vesselId, isWatched, loading, onToggle]
  );

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setAnimating(true);
      setTimeout(() => setAnimating(false), 500);

      if (!user) {
        openNotificationModal({
          contextType: "vessel",
          onSuccess: async (authUser) => {
            // Add to watchlist after auth
            const supabase = createClient();
            await fetch("/api/notifications/subscribe-auth", { method: "POST" });
            await supabase
              .from("watchlist")
              .insert({ user_id: authUser.id, vessel_id: vesselId });
            setIsWatched(true);
            bumpCount(1);
            onToggle?.(vesselId, true);
          },
        });
        return;
      }

      await doToggle(user);
    },
    [user, doToggle, vesselId, onToggle, openNotificationModal]
  );

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={className ?? `flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${isWatched ? "text-amber-500 hover:text-amber-600" : "text-slate-400 hover:text-amber-500"}`}
      title={!user ? "Meldingen instellen" : isWatched ? "Prijsmelding uitschakelen" : "Prijsmelding inschakelen"}
    >
      {isWatched ? (
        <svg className={`h-5 w-5 text-amber-500${animating ? " animate-bell-ring" : ""}`} viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className={`h-5 w-5${animating ? " animate-bell-ring" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      )}
    </button>
  );
}

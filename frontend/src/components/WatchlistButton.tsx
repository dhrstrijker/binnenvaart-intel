"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationModal } from "@/lib/NotificationModalContext";
import type { User } from "@supabase/supabase-js";

interface WatchlistButtonProps {
  vesselId: string;
  user: User | null;
  className?: string;
  onToggle?: (vesselId: string, isWatched: boolean) => void;
}

export default function WatchlistButton({ vesselId, user, className, onToggle }: WatchlistButtonProps) {
  const [isWatched, setIsWatched] = useState(false);
  const [loading, setLoading] = useState(false);
  const { openNotificationModal } = useNotificationModal();

  useEffect(() => {
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
  }, [user, vesselId]);

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
            onToggle?.(vesselId, false);
          }
        } else {
          const { error } = await supabase
            .from("watchlist")
            .insert({ user_id: currentUser.id, vessel_id: vesselId });
          if (error) {
            setIsWatched(prev);
          } else {
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

      if (!user) {
        openNotificationModal({
          vesselId,
          onSuccess: () => {
            setIsWatched(true);
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
      className={className ?? "flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-amber-500 disabled:opacity-50"}
      title={!user ? "Meldingen instellen" : isWatched ? "Prijsmelding uitschakelen" : "Prijsmelding inschakelen"}
    >
      {isWatched ? (
        <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      )}
    </button>
  );
}

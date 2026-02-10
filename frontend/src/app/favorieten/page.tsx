"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/lib/useSubscription";
import { useLocalFavorites } from "@/lib/useLocalFavorites";
import { useAuthModal } from "@/lib/AuthModalContext";
import { Vessel, VESSEL_LIST_COLUMNS } from "@/lib/supabase";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VesselCard from "@/components/VesselCard";

const UNDO_DELAY_MS = 5000;

export default function FavorietenPage() {
  const { user, isPremium, isLoading } = useSubscription();
  const { localFavorites, addLocal } = useLocalFavorites();
  const { openAuthModal } = useAuthModal();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Fetch Supabase favorites for logged-in users
  useEffect(() => {
    if (isLoading) return;

    if (user) {
      fetchAuthenticatedFavorites();
    } else {
      fetchLocalFavorites();
    }

    async function fetchAuthenticatedFavorites() {
      const supabase = createClient();
      const { data: favs } = await supabase
        .from("favorites")
        .select("vessel_id")
        .eq("user_id", user!.id);

      if (!favs || favs.length === 0) {
        setVessels([]);
        setLoadingVessels(false);
        return;
      }

      const vesselIds = favs.map((f) => f.vessel_id);

      const { data: vesselData } = await supabase
        .from("vessels")
        .select(VESSEL_LIST_COLUMNS)
        .in("id", vesselIds);

      setVessels(vesselData ?? []);
      setLoadingVessels(false);
    }

    async function fetchLocalFavorites() {
      if (localFavorites.length === 0) {
        setVessels([]);
        setLoadingVessels(false);
        return;
      }

      const supabase = createClient();
      const { data: vesselData } = await supabase
        .from("vessels")
        .select(VESSEL_LIST_COLUMNS)
        .in("id", localFavorites);

      setVessels(vesselData ?? []);
      setLoadingVessels(false);
    }
  }, [user, isLoading, localFavorites]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleFavoriteToggle = useCallback(
    (vesselId: string, isFavorite: boolean) => {
      if (isFavorite) {
        // Re-favorited (e.g. undo path or toggled back) — cancel any pending removal
        const existing = timersRef.current.get(vesselId);
        if (existing) {
          clearTimeout(existing);
          timersRef.current.delete(vesselId);
          setPendingRemovals((prev) => {
            const next = new Set(prev);
            next.delete(vesselId);
            return next;
          });
        }
        return;
      }

      // Unfavorited — start 5s pending removal
      setPendingRemovals((prev) => new Set(prev).add(vesselId));

      const timer = setTimeout(() => {
        timersRef.current.delete(vesselId);
        setPendingRemovals((prev) => {
          const next = new Set(prev);
          next.delete(vesselId);
          return next;
        });
        setVessels((prev) => prev.filter((v) => v.id !== vesselId));
      }, UNDO_DELAY_MS);

      timersRef.current.set(vesselId, timer);
    },
    []
  );

  const handleUndo = useCallback(
    async (vesselId: string) => {
      // Cancel the removal timer
      const timer = timersRef.current.get(vesselId);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(vesselId);
      }

      setPendingRemovals((prev) => {
        const next = new Set(prev);
        next.delete(vesselId);
        return next;
      });

      // Re-favorite the vessel
      if (user) {
        const supabase = createClient();
        await supabase
          .from("favorites")
          .upsert(
            { user_id: user.id, vessel_id: vesselId },
            { onConflict: "user_id,vessel_id" }
          );
      } else {
        addLocal(vesselId);
      }
    },
    [user, addLocal]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
        </div>
        <Footer />
      </div>
    );
  }

  // For the empty state, exclude pending removals from the count
  const visibleCount = vessels.filter((v) => !pendingRemovals.has(v.id)).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">Mijn Favorieten</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user
            ? "Schepen die je hebt opgeslagen als favoriet."
            : "Schepen die je lokaal hebt opgeslagen. Maak een account aan om ze permanent te bewaren."}
        </p>

        {/* Nudge for anonymous users with local favorites */}
        {!user && vessels.length > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-cyan-50 px-4 py-3 ring-1 ring-cyan-200">
            <svg className="h-5 w-5 shrink-0 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="flex-1 text-sm text-cyan-800">
              Je favorieten zijn alleen lokaal opgeslagen. Maak een account aan om ze overal te bewaren en meldingen te ontvangen.
            </p>
            <button
              onClick={() => openAuthModal()}
              className="shrink-0 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-700"
            >
              Account aanmaken
            </button>
          </div>
        )}

        {loadingVessels ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
          </div>
        ) : visibleCount === 0 && vessels.length === 0 ? (
          <div className="mt-12 rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-100">
            <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            <p className="mt-4 text-sm font-medium text-slate-900">
              Je hebt nog geen favorieten
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Klik op het hartje bij een schip om het op te slaan.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vessels.map((v) => {
              const isPending = pendingRemovals.has(v.id);
              return (
                <div key={v.id} className="relative">
                  <div
                    className={`transition-all duration-500 ${isPending ? "opacity-40 scale-[0.97]" : "opacity-100 scale-100"}`}
                  >
                    <VesselCard
                      vessel={v}
                      isPremium={isPremium}
                      user={user}
                      isFavorite={!isPending}
                      onFavoriteToggle={(isFav) => handleFavoriteToggle(v.id, isFav)}
                    />
                  </div>

                  {/* Undo overlay */}
                  {isPending && (
                    <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between rounded-b-xl bg-slate-900/80 px-4 py-2.5 backdrop-blur-sm">
                      <span className="text-sm font-medium text-white">
                        Verwijderd uit favorieten
                      </span>
                      <button
                        onClick={() => handleUndo(v.id)}
                        className="rounded-lg bg-white px-3 py-1 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                      >
                        Ongedaan maken
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

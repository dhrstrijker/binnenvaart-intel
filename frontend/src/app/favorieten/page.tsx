"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/lib/useSubscription";
import { useLocalFavorites } from "@/lib/useLocalFavorites";
import { useAuthModal } from "@/lib/AuthModalContext";
import { Vessel, WatchlistEntry } from "@/lib/supabase";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VesselCard from "@/components/VesselCard";
import WatchlistButton from "@/components/WatchlistButton";

export default function FavorietenPage() {
  const { user, isPremium, isLoading } = useSubscription();
  const { localFavorites } = useLocalFavorites();
  const { openAuthModal } = useAuthModal();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [watchlistMap, setWatchlistMap] = useState<Record<string, WatchlistEntry>>({});

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
        .select("*")
        .in("id", vesselIds);

      setVessels(vesselData ?? []);

      const { data: watchlistData } = await supabase
        .from("watchlist")
        .select("*")
        .eq("user_id", user!.id)
        .in("vessel_id", vesselIds);

      if (watchlistData) {
        const map: Record<string, WatchlistEntry> = {};
        for (const w of watchlistData) {
          map[w.vessel_id] = w as WatchlistEntry;
        }
        setWatchlistMap(map);
      }

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
        .select("*")
        .in("id", localFavorites);

      setVessels(vesselData ?? []);
      setLoadingVessels(false);
    }
  }, [user, isLoading, localFavorites]);

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
        ) : vessels.length === 0 ? (
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
              const watched = !!watchlistMap[v.id];
              return (
                <div key={v.id}>
                  <VesselCard vessel={v} isPremium={isPremium} user={user} />
                  {user && (
                    <div className="flex items-center justify-between rounded-b-xl bg-white px-3 py-2 ring-1 ring-gray-100 -mt-1">
                      <div className="flex items-center gap-1.5">
                        {watched ? (
                          <svg className="h-4 w-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                            <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                          </svg>
                        )}
                        <span className={`text-xs font-medium ${watched ? "text-amber-600" : "text-slate-400"}`}>
                          {watched ? "Meldingen aan" : "Geen meldingen"}
                        </span>
                      </div>
                      <WatchlistButton
                        vesselId={v.id}
                        user={user}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-amber-500 disabled:opacity-50"
                        onToggle={(vesselId, isWatched) => {
                          setWatchlistMap((prev) => {
                            const next = { ...prev };
                            if (isWatched) {
                              next[vesselId] = {
                                id: "",
                                user_id: user!.id,
                                vessel_id: vesselId,
                                added_at: new Date().toISOString(),
                                notify_price_change: true,
                                notify_status_change: true,
                              };
                            } else {
                              delete next[vesselId];
                            }
                            return next;
                          });
                        }}
                      />
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

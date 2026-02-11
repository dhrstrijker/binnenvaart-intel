"use client";

import { useEffect, useRef, useState } from "react";
import { Vessel, PriceHistory, VESSEL_LIST_COLUMNS } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/lib/useSubscription";

interface VesselData {
  vessels: Vessel[];
  priceHistoryMap: Record<string, PriceHistory[]>;
  favoriteIds: Set<string>;
  watchlistIds: Set<string>;
  loading: boolean;
  error: string | null;
  user: ReturnType<typeof useSubscription>["user"];
  isPremium: boolean;
}

export function useVesselData(): VesselData {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [priceHistoryMap, setPriceHistoryMap] = useState<Record<string, PriceHistory[]>>({});
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      // Only show skeleton on first load; keep stale data visible on refetch
      if (!hasLoadedOnceRef.current) setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        const vesselsRes = await supabase
          .from("vessels")
          .select(VESSEL_LIST_COLUMNS)
          .order("scraped_at", { ascending: false });

        if (vesselsRes.error) {
          throw vesselsRes.error;
        } else {
          const all = vesselsRes.data ?? [];
          const canonicalVessels = all.filter((v) => v.canonical_vessel_id === null || v.canonical_vessel_id === undefined);
          const vesselIds = canonicalVessels.map((v) => v.id);
          if (!cancelled) {
            setVessels(canonicalVessels);
          }

          // Build parallel fetches based on user tier
          const parallel: Promise<void>[] = [];

          if (user && isPremium) {
            if (vesselIds.length === 0) {
              if (!cancelled) setPriceHistoryMap({});
            } else {
              parallel.push(
                Promise.resolve(
                  supabase
                    .from("price_history")
                    .select("vessel_id, price, recorded_at")
                    .in("vessel_id", vesselIds)
                    .order("recorded_at", { ascending: true })
                ).then((historyRes) => {
                  if (!cancelled && !historyRes.error && historyRes.data) {
                    const grouped: Record<string, PriceHistory[]> = {};
                    for (const entry of historyRes.data) {
                      if (!grouped[entry.vessel_id]) {
                        grouped[entry.vessel_id] = [];
                      }
                      grouped[entry.vessel_id].push(entry as PriceHistory);
                    }
                    setPriceHistoryMap(grouped);
                  }
                })
              );
            }
          } else {
            if (!cancelled) setPriceHistoryMap({});
          }

          // Batch-fetch user's favorites + watchlist (eliminates per-card N+1 queries)
          if (user) {
            parallel.push(
              Promise.resolve(
                supabase
                  .from("favorites")
                  .select("vessel_id")
                  .eq("user_id", user.id)
              ).then(({ data }) => {
                if (!cancelled) setFavoriteIds(new Set((data ?? []).map((f) => f.vessel_id)));
              })
            );
            parallel.push(
              Promise.resolve(
                supabase
                  .from("watchlist")
                  .select("vessel_id")
                  .eq("user_id", user.id)
              ).then(({ data }) => {
                if (!cancelled) setWatchlistIds(new Set((data ?? []).map((w) => w.vessel_id)));
              })
            );
          } else {
            if (!cancelled) {
              setFavoriteIds(new Set());
              setWatchlistIds(new Set());
            }
          }

          await Promise.all(parallel);
        }
      } catch {
        if (!cancelled) setError("Er is een fout opgetreden bij het laden van de gegevens.");
      }
      if (!cancelled) {
        hasLoadedOnceRef.current = true;
        setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [user, isPremium, subLoading]);

  return { vessels, priceHistoryMap, favoriteIds, watchlistIds, loading, error, user, isPremium };
}

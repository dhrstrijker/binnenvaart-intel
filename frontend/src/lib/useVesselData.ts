"use client";

import { useEffect, useState } from "react";
import { Vessel, PriceHistory, VESSEL_LIST_COLUMNS } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/lib/useSubscription";

interface VesselData {
  vessels: Vessel[];
  priceHistoryMap: Record<string, PriceHistory[]>;
  freeTierTrends: Record<string, "up" | "down">;
  loading: boolean;
  error: string | null;
  user: ReturnType<typeof useSubscription>["user"];
  isPremium: boolean;
}

export function useVesselData(): VesselData {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [priceHistoryMap, setPriceHistoryMap] = useState<Record<string, PriceHistory[]>>({});
  const [freeTierTrends, setFreeTierTrends] = useState<Record<string, "up" | "down">>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, isPremium, isLoading: subLoading } = useSubscription();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        const vesselsRes = await supabase
          .from("vessels")
          .select(VESSEL_LIST_COLUMNS)
          .order("scraped_at", { ascending: false });

        if (vesselsRes.error) {
          setError("Er is een fout opgetreden bij het laden van de gegevens.");
        } else {
          const all = vesselsRes.data ?? [];
          setVessels(all.filter((v) => v.canonical_vessel_id === null || v.canonical_vessel_id === undefined));
        }

        if (user && isPremium) {
          const historyRes = await supabase
            .from("price_history")
            .select("*")
            .order("recorded_at", { ascending: true });

          if (!historyRes.error && historyRes.data) {
            const grouped: Record<string, PriceHistory[]> = {};
            for (const entry of historyRes.data) {
              if (!grouped[entry.vessel_id]) {
                grouped[entry.vessel_id] = [];
              }
              grouped[entry.vessel_id].push(entry);
            }
            setPriceHistoryMap(grouped);
          }
        } else {
          setPriceHistoryMap({});
        }

        if (!user || !isPremium) {
          const { data: activityData } = await supabase
            .from("activity_log")
            .select("vessel_id, old_price, new_price")
            .eq("event_type", "price_changed")
            .order("recorded_at", { ascending: false });

          if (activityData) {
            const trendMap: Record<string, "up" | "down"> = {};
            for (const entry of activityData) {
              if (!trendMap[entry.vessel_id] && entry.old_price != null && entry.new_price != null) {
                if (entry.new_price > entry.old_price) trendMap[entry.vessel_id] = "up";
                else if (entry.new_price < entry.old_price) trendMap[entry.vessel_id] = "down";
              }
            }
            setFreeTierTrends(trendMap);
          }
        }
      } catch {
        setError("Er is een fout opgetreden bij het laden van de gegevens.");
      }
      setLoading(false);
    }

    if (!subLoading) {
      fetchData();
    }
  }, [user, isPremium, subLoading]);

  return { vessels, priceHistoryMap, freeTierTrends, loading, error, user, isPremium };
}

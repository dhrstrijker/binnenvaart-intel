"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, Vessel, PriceHistory } from "@/lib/supabase";
import { useSubscription } from "@/lib/useSubscription";
import { useLocalFavorites } from "@/lib/useLocalFavorites";
import { useAuthNudge } from "@/lib/useAuthNudge";
import { useAuthModal } from "@/lib/AuthModalContext";
import VesselCard from "./VesselCard";
import AuthNudgeToast from "./AuthNudgeToast";
import Filters, { FilterState } from "./Filters";

const INITIAL_FILTERS: FilterState = {
  search: "",
  type: "",
  source: "",
  minPrice: "",
  maxPrice: "",
  minLength: "",
  maxLength: "",
  minTonnage: "",
  maxTonnage: "",
  minBuildYear: "",
  maxBuildYear: "",
  sort: "newest",
  showRemoved: false,
};

export default function Dashboard() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [priceHistoryMap, setPriceHistoryMap] = useState<Record<string, PriceHistory[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [visibleCount, setVisibleCount] = useState(24);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const { localFavorites } = useLocalFavorites();
  const { shouldShowNudge, dismissNudge } = useAuthNudge(localFavorites.length);
  const { openAuthModal } = useAuthModal();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = getSupabase();

        // Always fetch vessels
        const vesselsRes = await supabase
          .from("vessels")
          .select("id, name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, source_id, scraped_at, first_seen_at, updated_at, status, canonical_vessel_id, linked_sources")
          .order("scraped_at", { ascending: false });

        if (vesselsRes.error) {
          setError("Er is een fout opgetreden bij het laden van de gegevens.");
        } else {
          const all = vesselsRes.data ?? [];
          setVessels(all.filter((v) => v.canonical_vessel_id === null || v.canonical_vessel_id === undefined));
        }

        // Only fetch price history if user is authenticated and premium
        // RLS blocks anon/non-premium anyway, but skip the request to avoid empty errors
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
      } catch {
        setError("Er is een fout opgetreden bij het laden van de gegevens.");
      }
      setLoading(false);
    }

    // Wait for subscription check to finish before fetching
    if (!subLoading) {
      fetchData();
    }
  }, [user, isPremium, subLoading]);

  const availableTypes = useMemo(() => {
    const types = new Set(vessels.map((v) => v.type).filter(Boolean));
    return Array.from(types).sort();
  }, [vessels]);

  const filtered = useMemo(() => {
    let result = [...vessels];

    if (!filters.showRemoved) {
      result = result.filter((v) => v.status !== "removed" && v.status !== "sold");
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((v) => v.name.toLowerCase().includes(q));
    }

    if (filters.type) {
      result = result.filter((v) => v.type === filters.type);
    }

    if (filters.source) {
      result = result.filter((v) =>
        v.source === filters.source ||
        (v.linked_sources?.some((ls) => ls.source === filters.source) ?? false)
      );
    }

    if (filters.minPrice) {
      const min = Number(filters.minPrice);
      result = result.filter((v) => v.price !== null && v.price >= min);
    }

    if (filters.maxPrice) {
      const max = Number(filters.maxPrice);
      result = result.filter((v) => v.price !== null && v.price <= max);
    }

    if (filters.minLength) {
      const min = Number(filters.minLength);
      result = result.filter((v) => v.length_m !== null && v.length_m >= min);
    }

    if (filters.maxLength) {
      const max = Number(filters.maxLength);
      result = result.filter((v) => v.length_m !== null && v.length_m <= max);
    }

    if (filters.minTonnage) {
      const min = Number(filters.minTonnage);
      result = result.filter((v) => v.tonnage !== null && v.tonnage >= min);
    }

    if (filters.maxTonnage) {
      const max = Number(filters.maxTonnage);
      result = result.filter((v) => v.tonnage !== null && v.tonnage <= max);
    }

    if (filters.minBuildYear) {
      const min = Number(filters.minBuildYear);
      result = result.filter((v) => v.build_year !== null && v.build_year >= min);
    }

    if (filters.maxBuildYear) {
      const max = Number(filters.maxBuildYear);
      result = result.filter((v) => v.build_year !== null && v.build_year <= max);
    }

    switch (filters.sort) {
      case "price_asc":
        result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        break;
      case "price_desc":
        result.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "newest":
      default:
        result.sort(
          (a, b) =>
            new Date(b.first_seen_at).getTime() -
            new Date(a.first_seen_at).getTime()
        );
    }

    return result;
  }, [vessels, filters]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(24);
  }, [filters]);

  // IntersectionObserver to load more vessels on scroll
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + 24);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading || filtered.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loading, filtered.length]);

  const handleSaveAsSearch = useCallback((f: FilterState) => {
    const params = new URLSearchParams({ prefill: "1" });
    if (f.search) params.set("search", f.search);
    if (f.type) params.set("type", f.type);
    if (f.source) params.set("source", f.source);
    if (f.minPrice) params.set("minPrice", f.minPrice);
    if (f.maxPrice) params.set("maxPrice", f.maxPrice);
    if (f.minLength) params.set("minLength", f.minLength);
    if (f.maxLength) params.set("maxLength", f.maxLength);
    if (f.minTonnage) params.set("minTonnage", f.minTonnage);
    if (f.maxTonnage) params.set("maxTonnage", f.maxTonnage);
    if (f.minBuildYear) params.set("minBuildYear", f.minBuildYear);
    if (f.maxBuildYear) params.set("maxBuildYear", f.maxBuildYear);
    router.push(`/zoekopdrachten?${params.toString()}`);
  }, [router]);

  const visibleVessels = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <svg
            className="mx-auto h-10 w-10 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <h3 className="mt-3 text-lg font-semibold text-red-800">
            Kon gegevens niet laden
          </h3>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="sr-only">Binnenvaartschepen te koop</h1>
      {/* Filters */}
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-2 bg-gradient-to-b from-slate-50 from-80% to-transparent">
        <Filters
          filters={filters}
          onFilterChange={setFilters}
          availableTypes={availableTypes}
          vesselCount={filtered.length}
          user={user}
          onSaveAsSearch={handleSaveAsSearch}
          onAuthPrompt={() => openAuthModal()}
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
          <p className="text-sm text-slate-500">Schepen laden...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 py-16">
          <svg
            className="h-16 w-16 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"
            />
          </svg>
          <h3 className="text-lg font-semibold text-slate-600">
            Geen schepen gevonden
          </h3>
          <p className="text-sm text-slate-400">
            Pas je filters aan of probeer een andere zoekopdracht.
          </p>
        </div>
      )}

      {/* Vessel grid */}
      {!loading && filtered.length > 0 && (
        <>
          <div id="vessel-results" className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleVessels.map((vessel) => (
              <VesselCard
                key={vessel.id}
                vessel={vessel}
                priceHistory={priceHistoryMap[vessel.id] ?? []}
                isPremium={isPremium}
                user={user}
              />
            ))}
          </div>

          {/* Scroll sentinel + loading indicator */}
          <div ref={sentinelRef} className="mt-6 flex flex-col items-center gap-2 py-4">
            {hasMore && (
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
            )}
            <p className="text-xs text-slate-400">
              {visibleVessels.length} van {filtered.length} schepen
            </p>
          </div>
        </>
      )}

      {/* Auth nudge toast for anonymous users with 3+ local favorites */}
      {!user && shouldShowNudge && (
        <AuthNudgeToast onDismiss={dismissNudge} />
      )}
    </div>
  );
}


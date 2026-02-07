"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { getSupabase, Vessel, PriceHistory } from "@/lib/supabase";
import { useSubscription } from "@/lib/useSubscription";
import { useActivityLog } from "@/lib/useActivityLog";
import { SOURCE_CONFIG } from "@/lib/sources";
import VesselCard from "./VesselCard";
import Filters, { FilterState } from "./Filters";

const INITIAL_FILTERS: FilterState = {
  search: "",
  type: "",
  source: "",
  minPrice: "",
  maxPrice: "",
  sort: "newest",
  showRemoved: false,
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}u`;
  return `${diffDays}d`;
}

export default function Dashboard() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [priceHistoryMap, setPriceHistoryMap] = useState<Record<string, PriceHistory[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [visibleCount, setVisibleCount] = useState(24);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const { entries: activityEntries, loading: activityLoading } = useActivityLog(3);

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
          setError(vesselsRes.error.message);
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
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Kon geen verbinding maken"
        );
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
      {/* Broker sources */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide mr-1">Bronnen</span>
        {Object.entries(SOURCE_CONFIG).map(([key, { label, color }]) => (
          <span
            key={key}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Recent Market Activity */}
      {!activityLoading && activityEntries.length > 0 && (
        <div className="mb-6 rounded-xl bg-white shadow-md ring-1 ring-gray-100 overflow-hidden">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              Recente marktactiviteit
            </h2>
            <div className="flex flex-col gap-2">
              {activityEntries.map((entry) => {
                const timeAgo = formatTimeAgo(new Date(entry.recorded_at));
                const dotColor =
                  entry.event_type === "inserted"
                    ? "bg-emerald-500"
                    : entry.event_type === "price_changed"
                      ? "bg-amber-500"
                      : entry.event_type === "sold"
                        ? "bg-amber-600"
                        : "bg-red-500";
                const label =
                  entry.event_type === "inserted"
                    ? "Nieuw"
                    : entry.event_type === "price_changed"
                      ? "Prijswijziging"
                      : entry.event_type === "sold"
                        ? "Verkocht"
                        : "Verwijderd";
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />
                    <span className="truncate font-medium text-slate-700">
                      {entry.vessel_name}
                    </span>
                    <span className="flex-shrink-0 text-slate-400">{label}</span>
                    {entry.event_type === "price_changed" &&
                      entry.old_price != null &&
                      entry.new_price != null && (
                        <span className="flex-shrink-0 text-slate-500">
                          {new Intl.NumberFormat("nl-NL", {
                            style: "currency",
                            currency: "EUR",
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          }).format(entry.old_price)}{" "}
                          &rarr;{" "}
                          {new Intl.NumberFormat("nl-NL", {
                            style: "currency",
                            currency: "EUR",
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          }).format(entry.new_price)}
                        </span>
                      )}
                    {entry.event_type === "inserted" && entry.new_price != null && (
                      <span className="flex-shrink-0 text-slate-500">
                        {new Intl.NumberFormat("nl-NL", {
                          style: "currency",
                          currency: "EUR",
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(entry.new_price)}
                      </span>
                    )}
                    <span className="ml-auto flex-shrink-0 text-slate-400">{timeAgo}</span>
                  </div>
                );
              })}
            </div>
            {/* CTA based on auth tier */}
            {!user && (
              <a
                href="/signup"
                className="mt-3 block text-center text-xs font-medium text-cyan-600 hover:text-cyan-500"
              >
                Maak een gratis account voor meer activiteit &rarr;
              </a>
            )}
            {user && !isPremium && (
              <a
                href="/pricing"
                className="mt-3 block text-center text-xs font-medium text-cyan-600 hover:text-cyan-500"
              >
                Upgrade voor volledige geschiedenis &rarr;
              </a>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <Filters
        filters={filters}
        onFilterChange={setFilters}
        availableTypes={availableTypes}
        vesselCount={filtered.length}
      />

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
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
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

    </div>
  );
}


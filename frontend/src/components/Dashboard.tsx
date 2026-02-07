"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { getSupabase, Vessel, PriceHistory } from "@/lib/supabase";
import { useSubscription } from "@/lib/useSubscription";
import VesselCard from "./VesselCard";
import VesselDetail from "./VesselDetail";
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

function formatAvgPrice(vessels: Vessel[]): string {
  const withPrice = vessels.filter((v) => v.price !== null);
  if (withPrice.length === 0) return "-";
  const avg = withPrice.reduce((s, v) => s + (v.price ?? 0), 0) / withPrice.length;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(avg);
}

export default function Dashboard() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [priceHistoryMap, setPriceHistoryMap] = useState<Record<string, PriceHistory[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const { user, isPremium, isLoading: subLoading } = useSubscription();

  const handleOpenDetail = useCallback((vessel: Vessel) => {
    setSelectedVessel(vessel);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedVessel(null);
  }, []);

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
      result = result.filter((v) => v.status !== "removed");
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

  const uniqueSources = useMemo(
    () => new Set(vessels.map((v) => v.source)).size,
    [vessels]
  );

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
      {/* Stats bar */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Totaal schepen"
          value={loading ? "-" : String(vessels.length)}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          }
        />
        <StatCard
          label="Gem. prijs"
          value={loading ? "-" : formatAvgPrice(vessels)}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Bronnen"
          value={loading ? "-" : String(uniqueSources)}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          }
        />
        <StatCard
          label="Weergegeven"
          value={loading ? "-" : String(filtered.length)}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          }
        />
      </div>

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
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((vessel) => (
            <VesselCard
              key={vessel.id}
              vessel={vessel}
              priceHistory={priceHistoryMap[vessel.id] ?? []}
              isPremium={isPremium}
              onOpenDetail={handleOpenDetail}
            />
          ))}
        </div>
      )}

      {/* Vessel detail modal */}
      {selectedVessel && (
        <VesselDetail
          vessel={selectedVessel}
          history={(() => {
            const ids = [selectedVessel.id];
            if (selectedVessel.linked_sources) {
              for (const ls of selectedVessel.linked_sources) {
                if (ls.vessel_id !== selectedVessel.id) {
                  ids.push(ls.vessel_id);
                }
              }
            }
            const combined: PriceHistory[] = [];
            for (const vid of ids) {
              const entries = priceHistoryMap[vid];
              if (entries) combined.push(...entries);
            }
            return combined.sort((a, b) =>
              new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
            );
          })()}
          isPremium={isPremium}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-md ring-1 ring-gray-100">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="text-lg font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

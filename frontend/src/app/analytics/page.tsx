"use client";

import React, { useEffect, useState } from "react";
import { getSupabase, Vessel, PriceHistory } from "@/lib/supabase";
import NavLink from "@/components/NavLink";
import MarketOverview from "@/components/analytics/MarketOverview";
import SupplyByType from "@/components/analytics/TypeBreakdown";
import TimeOnMarket from "@/components/analytics/PriceDistribution";
import PriceTrends from "@/components/analytics/PriceTrends";
import PricePressure from "@/components/analytics/SourceComparison";
import CompetitivePosition from "@/components/analytics/MarketFlow";

export default function AnalyticsPage() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = getSupabase();
        const [vesselsRes, priceRes] = await Promise.all([
          supabase.from("vessels").select("id, name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, source_id, scraped_at, first_seen_at, updated_at, canonical_vessel_id, linked_sources"),
          supabase
            .from("price_history")
            .select("*")
            .order("recorded_at", { ascending: true }),
        ]);

        if (vesselsRes.error) {
          setError(vesselsRes.error.message);
          return;
        }
        if (priceRes.error) {
          setError(priceRes.error.message);
          return;
        }

        setVessels(vesselsRes.data ?? []);
        setPriceHistory(priceRes.data ?? []);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Kon geen verbinding maken"
        );
      }
      setLoading(false);
    }

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Ship icon */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Binnenvaart Intel
              </h1>
              <p className="text-xs text-blue-200 sm:text-sm">
                Scheepvaart marktplaats monitor
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-2">
            <NavLink href="/">Dashboard</NavLink>
            <NavLink href="/analytics">Analyse</NavLink>
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Page title */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Marktanalyse</h2>
          <p className="text-sm text-slate-500">
            Marktinzichten voor scheepseigenaren en kopers
          </p>
        </div>

        {/* Error state */}
        {error && (
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
        )}

        {/* Loading state */}
        {loading && !error && (
          <div className="mt-12 flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            <p className="text-sm text-slate-500">Analyse laden...</p>
          </div>
        )}

        {/* Analytics content */}
        {!loading && !error && (
          <div className="space-y-6">
            {/* KPI overview cards */}
            <MarketOverview vessels={vessels} />

            {/* Supply by type + Time on market */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SupplyByType vessels={vessels} />
              <TimeOnMarket vessels={vessels} />
            </div>

            {/* Price trends by type (full-width) */}
            <PriceTrends priceHistory={priceHistory} vessels={vessels} />

            {/* Price pressure + Competitive position */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <PricePressure vessels={vessels} priceHistory={priceHistory} />
              <CompetitivePosition vessels={vessels} />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-center text-xs text-slate-400">
            Binnenvaart Intel &mdash; Gegevens van 4 makelaars
          </p>
        </div>
      </footer>
    </div>
  );
}

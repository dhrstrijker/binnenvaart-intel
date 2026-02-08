"use client";

import React, { useEffect, useState } from "react";
import { Vessel, PriceHistory, getSupabase } from "@/lib/supabase";
import { sourceLabel } from "@/lib/sources";
import PriceHistoryChart from "./PriceHistoryChart";
import PremiumGate from "./PremiumGate";
import VesselCard from "./VesselCard";
import MarineTrafficMap from "./MarineTrafficMap";
import FavoriteButton from "./FavoriteButton";
import WatchlistButton from "./WatchlistButton";
import BrokerCard from "./BrokerCard";
import ImageGallery from "./ImageGallery";
import DealScoreBadge from "./DealScoreBadge";
import { useSubscription } from "@/lib/useSubscription";
import { predictPriceRange, computeDaysOnMarket, formatDaysOnMarket, shouldSuppressPrediction, getConfidenceLevel } from "@/lib/vesselPricing";
import { computeDealScores } from "@/lib/dealScore";

interface VesselPageContentProps {
  vessel: Vessel;
  similarVessels: Vessel[];
}

function formatPrice(price: number | null): string {
  if (price === null) return "Prijs op aanvraag";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function VesselPageContent({ vessel, similarVessels }: VesselPageContentProps) {
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [freeTrend, setFreeTrend] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (subLoading || !user || !isPremium) return;

    async function fetchHistory() {
      const supabase = getSupabase();
      const ids = [vessel.id];
      if (vessel.linked_sources) {
        for (const ls of vessel.linked_sources) {
          if (ls.vessel_id !== vessel.id) {
            ids.push(ls.vessel_id);
          }
        }
      }

      const { data } = await supabase
        .from("price_history")
        .select("*")
        .in("vessel_id", ids)
        .order("recorded_at", { ascending: true });

      if (data) setHistory(data);
    }

    fetchHistory();
  }, [vessel.id, vessel.linked_sources, user, isPremium, subLoading]);

  // Free-tier price trend from activity_log
  useEffect(() => {
    if (subLoading || isPremium) return;

    async function fetchFreeTrend() {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("activity_log")
        .select("old_price, new_price")
        .eq("vessel_id", vessel.id)
        .eq("event_type", "price_changed")
        .order("recorded_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const { old_price, new_price } = data[0];
        if (old_price !== null && new_price !== null) {
          if (new_price > old_price) setFreeTrend('up');
          else if (new_price < old_price) setFreeTrend('down');
        }
      }
    }

    fetchFreeTrend();
  }, [vessel.id, isPremium, subLoading]);

  const priceChange =
    history.length >= 2
      ? history[history.length - 1].price - history[0].price
      : null;

  const priceChangePercent =
    history.length >= 2 && history[0].price !== 0
      ? ((history[history.length - 1].price - history[0].price) / history[0].price) * 100
      : null;

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: vessel.name, url });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShareOpen(true);
      setTimeout(() => setShareOpen(false), 2000);
    }
  };

  const multiSource = vessel.linked_sources && vessel.linked_sources.length >= 2;

  const specRows = [
    { label: "Type", value: vessel.type },
    {
      label: "Afmetingen",
      value:
        vessel.length_m && vessel.width_m
          ? `${vessel.length_m} x ${vessel.width_m} m`
          : vessel.length_m
            ? `${vessel.length_m} m`
            : null,
    },
    { label: "Tonnage", value: vessel.tonnage ? `${vessel.tonnage}t` : null },
    { label: "Bouwjaar", value: vessel.build_year },
  ].filter((r) => r.value);

  return (
    <article>
      {/* Sold banner */}
      {vessel.status === "sold" && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-800">
            Dit schip is verkocht.
          </p>
        </div>
      )}
      {/* Removed banner */}
      {vessel.status === "removed" && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
          <p className="text-sm font-semibold text-red-800">
            Dit schip is niet meer beschikbaar.
          </p>
        </div>
      )}

      {/* Main 2-column grid — starts immediately, no hero */}
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
        {/* Left: Image gallery with action buttons overlay */}
        <ImageGallery imageUrl={vessel.image_url}>
          <FavoriteButton
            vesselId={vessel.id}
            user={user}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:text-red-500 disabled:opacity-50"
          />
          <WatchlistButton
            vesselId={vessel.id}
            user={user}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:text-amber-500 disabled:opacity-50"
          />
          <div className="relative">
            <button
              type="button"
              onClick={handleShare}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:text-cyan-600"
              title="Deel dit schip"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            {shareOpen && (
              <span className="absolute -bottom-8 right-0 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                Link gekopieerd!
              </span>
            )}
          </div>
        </ImageGallery>

        {/* Right: Info panel */}
        <div className="mt-6 lg:mt-0 lg:sticky lg:top-6 lg:self-start space-y-5">
          {/* Vessel name + source */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{vessel.name}</h1>
              {multiSource && (
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                  {vessel.linked_sources!.length} bronnen
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {sourceLabel(vessel.source)} &middot; Eerste keer gezien{" "}
              {formatDate(vessel.first_seen_at)}
            </p>
            {(() => {
              const scores = computeDealScores([vessel]);
              const score = scores.get(vessel.id);
              const days = computeDaysOnMarket(vessel.first_seen_at);
              const daysLabel = formatDaysOnMarket(days);
              const isActive = vessel.status !== "removed" && vessel.status !== "sold";
              if (!score && !isActive) return null;
              return (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {score && <DealScoreBadge score={score} />}
                  {isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {daysLabel}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Price block */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-medium text-slate-500">Vraagprijs</p>
            {vessel.price !== null ? (
              <p className="text-3xl font-extrabold text-slate-900">
                {formatPrice(vessel.price)}
              </p>
            ) : (() => {
              const range = predictPriceRange(vessel);
              return range ? (
                <p className="text-2xl font-extrabold text-slate-400 italic" title="Geschatte prijsrange">
                  {formatPrice(range.low)} – {formatPrice(range.high)}
                </p>
              ) : (
                <p className="text-3xl font-extrabold text-slate-900">Prijs op aanvraag</p>
              );
            })()}
            {isPremium && priceChange !== null && priceChange !== 0 && priceChangePercent !== null && (
              <p
                className={`mt-1 text-xs font-semibold ${
                  priceChange < 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {priceChange < 0 ? "" : "+"}
                {priceChangePercent.toFixed(1)}% ({formatPrice(priceChange)})
              </p>
            )}
            {!isPremium && freeTrend !== null && (
              <p
                className={`mt-1 flex items-center gap-1 text-xs font-semibold ${
                  freeTrend === 'down' ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {freeTrend === 'down' ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
                {freeTrend === 'down' ? "Prijs gedaald" : "Prijs gestegen"}
              </p>
            )}

            {/* Price range bar — hidden for suppressed vessels */}
            {vessel.price !== null && !shouldSuppressPrediction(vessel) && (() => {
              const range = predictPriceRange(vessel);
              if (!range) return null;
              const pct = Math.max(0, Math.min(100, ((vessel.price - range.low) / (range.high - range.low)) * 100));
              const scores = computeDealScores([vessel]);
              const score = scores.get(vessel.id);
              const confidence = getConfidenceLevel(vessel);
              return (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{formatPrice(range.low)}</span>
                    <span className="text-slate-500 font-medium">Marktrange</span>
                    <span>{formatPrice(range.high)}</span>
                  </div>
                  <div className="relative mt-1.5 h-2 rounded-full bg-gradient-to-r from-emerald-200 via-slate-200 to-amber-200">
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-slate-800 ring-2 ring-white shadow"
                      style={{ left: `calc(${pct}% - 8px)` }}
                    />
                  </div>
                  {score && (
                    <p className={`mt-1.5 text-xs font-semibold ${score.pctDiff > 0 ? "text-emerald-600" : score.pctDiff < -15 ? "text-amber-600" : "text-slate-500"}`}>
                      {score.label}
                    </p>
                  )}
                  {confidence === "low" && (
                    <p className="mt-1 text-xs text-slate-400">Indicatieve schatting — beperkte data voor dit type</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Specs table */}
          {specRows.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Specificaties</h2>
              <dl className="space-y-2">
                {specRows.map((row) => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <dt className="text-slate-500">{row.label}</dt>
                    <dd className="font-medium text-slate-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* BrokerCard */}
          <BrokerCard vessel={vessel} />

        </div>
      </div>

      {/* Full-width sections below the grid */}

      {/* Price history */}
      <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Prijsgeschiedenis</h2>
        <div className="mt-3">
          <PremiumGate isPremium={isPremium}>
            {history.length >= 2 ? (
              <div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3" style={{ height: 180 }}>
                  <PriceHistoryChart history={history} width={580} height={160} />
                </div>
                <div className="mt-4 max-h-52 overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                        <th className="px-3 py-2 font-medium">Datum</th>
                        <th className="px-3 py-2 font-medium text-right">Prijs</th>
                        <th className="px-3 py-2 font-medium text-right">Verschil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => {
                        const diff = i > 0 ? h.price - history[i - 1].price : null;
                        return (
                          <tr key={h.id} className="border-b border-slate-50 last:border-b-0">
                            <td className="px-3 py-2 text-slate-600">{formatDate(h.recorded_at)}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">
                              {formatPrice(h.price)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {diff === null ? (
                                <span className="text-slate-400">&mdash;</span>
                              ) : diff === 0 ? (
                                <span className="text-slate-400">0</span>
                              ) : (
                                <span className={diff < 0 ? "text-emerald-600" : "text-red-500"}>
                                  {diff < 0 ? "" : "+"}
                                  {formatPrice(diff)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nog geen prijswijzigingen geregistreerd.</p>
            )}
          </PremiumGate>
        </div>
      </div>

      {/* Map */}
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Live positie</h2>
        <MarineTrafficMap className="mt-3 h-[400px] rounded-xl" />
      </div>

      {/* Back link */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            window.history.back();
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-800 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Terug naar overzicht
        </a>
      </div>

      {/* Similar vessels */}
      {similarVessels.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-slate-900">Misschien ook interessant</h2>
          <p className="mt-1 text-sm text-slate-500">
            Vergelijkbare {vessel.type ? vessel.type.toLowerCase() : "schepen"} in dezelfde prijsklasse
          </p>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similarVessels.map((v) => (
              <VesselCard key={v.id} vessel={v} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

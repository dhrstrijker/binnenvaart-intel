"use client";

import React, { useEffect, useState } from "react";
import { Vessel, PriceHistory } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/client";
import PriceHistoryChart from "./PriceHistoryChart";
import PremiumGate from "./PremiumGate";
import VesselCard from "./VesselCard";
import MarineTrafficMap from "./MarineTrafficMap";
import FavoriteButton from "./FavoriteButton";
import WatchlistButton from "./WatchlistButton";
import StickyVesselInfo from "./StickyVesselInfo";
import StickyBrokerCTA from "./StickyBrokerCTA";
import TechnicalSpecs from "./TechnicalSpecs";
import ImageGallery from "./ImageGallery";
import DealScoreBadge from "./DealScoreBadge";
import { MiniSparkline } from "./PriceHistoryChart";
import { useSubscription } from "@/lib/useSubscription";
import { predictPriceRange, shouldSuppressPrediction, getConfidenceLevel } from "@/lib/vesselPricing";
import { computeDealScores } from "@/lib/dealScore";
import { formatPrice, formatDate } from "@/lib/formatting";
import { hasRichData, extractRecentRenewals } from "@/lib/rawDetails";

interface VesselPageContentProps {
  vessel: Vessel;
  similarVessels: Vessel[];
}

export default function VesselPageContent({ vessel, similarVessels }: VesselPageContentProps) {
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [freeTrend, setFreeTrend] = useState<'up' | 'down' | null>(null);
  const [priceExpanded, setPriceExpanded] = useState(false);

  useEffect(() => {
    if (subLoading || !user || !isPremium) return;

    async function fetchHistory() {
      const supabase = createClient();
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
      const supabase = createClient();
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

  const showTechnical = hasRichData(vessel.raw_details);
  const renewals = extractRecentRenewals(vessel.raw_details);

  return (
    <article className="pb-20 lg:pb-0">
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

      {/* Main 2-column grid */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
        {/* ══ Left column ══ */}
        <div className="min-w-0 space-y-6">
          {/* Image gallery with action buttons */}
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

          {/* Recent renewals callout */}
          {renewals && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <svg className="h-5 w-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                </svg>
                <h3 className="text-sm font-semibold text-emerald-800">Recente vernieuwingen</h3>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{renewals}</p>
            </div>
          )}

          {/* Technical specs — conditional on data */}
          {showTechnical && <TechnicalSpecs vessel={vessel} />}

          {/* Compact price summary + collapsible full history */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Vraagprijs</p>
                <div className="flex items-center gap-2">
                  {vessel.price !== null ? (
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatPrice(vessel.price)}
                    </span>
                  ) : (() => {
                    const range = predictPriceRange(vessel);
                    return range ? (
                      <span className="text-xl font-extrabold text-slate-400 italic" title="Geschatte prijsrange">
                        {formatPrice(range.low)} – {formatPrice(range.high)}
                      </span>
                    ) : (
                      <span className="text-2xl font-extrabold text-slate-900">Prijs op aanvraag</span>
                    );
                  })()}
                  {/* Inline sparkline for premium */}
                  {isPremium && history.length >= 2 && <MiniSparkline history={history} />}
                </div>
                {/* Price change summary */}
                {isPremium && priceChange !== null && priceChange !== 0 && priceChangePercent !== null && (
                  <p
                    className={`mt-0.5 text-xs font-semibold ${
                      priceChange < 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {priceChange < 0 ? "" : "+"}
                    {priceChangePercent.toFixed(1)}% ({formatPrice(priceChange)}) sinds eerste waarneming
                  </p>
                )}
                {!isPremium && freeTrend !== null && (
                  <p
                    className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${
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
              </div>

              {/* Expand/collapse price history */}
              {isPremium && history.length >= 2 && (
                <button
                  onClick={() => setPriceExpanded((v) => !v)}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                  {priceExpanded ? "Verberg" : "Prijsverloop"}
                </button>
              )}
            </div>

            {/* Price range bar */}
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
                  {/* Condition signal pills */}
                  {vessel.condition_signals && (() => {
                    const signals = vessel.condition_signals as Record<string, unknown>;
                    const pos = (signals.value_factors_positive as string[] | undefined) ?? [];
                    const neg = (signals.value_factors_negative as string[] | undefined) ?? [];
                    if (pos.length === 0 && neg.length === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {pos.map((f) => (
                          <span key={f} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                            {f}
                          </span>
                        ))}
                        {neg.map((f) => (
                          <span key={f} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                            {f}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Collapsible price history chart */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                priceExpanded ? "max-h-[600px] opacity-100 mt-4" : "max-h-0 opacity-0"
              }`}
            >
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

            {/* Non-premium: upsell when collapsed */}
            {!isPremium && !priceExpanded && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <PremiumGate isPremium={false}><></></PremiumGate>
              </div>
            )}
          </div>

          {/* Map */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Live positie</h2>
            <MarineTrafficMap className="mt-3 h-[400px] rounded-xl" />
          </div>
        </div>

        {/* ══ Right column ══ */}
        <div className="mt-6 lg:mt-0">
          <div className="sticky top-6 space-y-4">
            <StickyVesselInfo vessel={vessel} />
            <StickyBrokerCTA vessel={vessel} />
          </div>
        </div>
      </div>

      {/* Full-width sections below */}

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

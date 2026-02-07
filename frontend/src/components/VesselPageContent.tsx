"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Vessel, PriceHistory, getSupabase } from "@/lib/supabase";
import { sourceLabel, sourceColor, safeUrl } from "@/lib/sources";
import PriceHistoryChart from "./PriceHistoryChart";
import PremiumGate from "./PremiumGate";
import VesselCard from "./VesselCard";
import MarineTrafficMap from "./MarineTrafficMap";
import FavoriteButton from "./FavoriteButton";
import WatchlistButton from "./WatchlistButton";
import { useSubscription } from "@/lib/useSubscription";

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
  const [imgError, setImgError] = React.useState(false);
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [shareOpen, setShareOpen] = useState(false);

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

      {/* Hero image — full width, immersive */}
      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl bg-slate-100 lg:aspect-[21/9]">
        {vessel.image_url && !imgError ? (
          <Image
            src={vessel.image_url}
            alt={vessel.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 896px"
            priority
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-20 w-20 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </div>
        )}

        {/* Badges top-left */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {vessel.type && (
            <span className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm">
              {vessel.type}
            </span>
          )}
          {multiSource && (
            <span className="rounded-md bg-indigo-100/90 px-2.5 py-1 text-xs font-semibold text-indigo-800 shadow-sm backdrop-blur-sm">
              {vessel.linked_sources!.length} bronnen
            </span>
          )}
        </div>

        {/* Action buttons top-right */}
        <div className="absolute top-3 right-3 flex gap-2">
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
        </div>

        {/* Gradient overlay with title */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-5 pb-5 pt-20 sm:px-6">
          <h1 className="text-xl font-bold text-white sm:text-2xl">{vessel.name}</h1>
          <p className="mt-0.5 text-sm text-white/75">
            {sourceLabel(vessel.source)} &middot; Eerste keer gezien{" "}
            {formatDate(vessel.first_seen_at)}
          </p>
        </div>
      </div>

      {/* Info bar — price, specs, broker link */}
      <div className="-mt-1 rounded-b-2xl bg-white px-5 pb-5 pt-4 shadow-sm ring-1 ring-slate-100 sm:px-6 lg:flex lg:items-center lg:justify-between lg:gap-6">
        {/* Price */}
        <div className="shrink-0">
          <p className="text-xs font-medium text-slate-500">Vraagprijs</p>
          <p className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
            {formatPrice(vessel.price)}
          </p>
          {isPremium && priceChange !== null && priceChange !== 0 && priceChangePercent !== null && (
            <p
              className={`text-xs font-semibold ${
                priceChange < 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {priceChange < 0 ? "" : "+"}
              {priceChangePercent.toFixed(1)}% ({formatPrice(priceChange)})
            </p>
          )}
        </div>

        {/* Divider (desktop) */}
        <div className="my-3 border-t border-slate-100 lg:my-0 lg:h-12 lg:border-t-0 lg:border-l" />

        {/* Spec pills */}
        <div className="flex flex-1 flex-wrap gap-2">
          {vessel.type && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              {vessel.type}
            </span>
          )}
          {vessel.length_m && vessel.width_m && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              {vessel.length_m} x {vessel.width_m} m
            </span>
          )}
          {vessel.build_year && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              Bouwjaar {vessel.build_year}
            </span>
          )}
          {vessel.tonnage && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              {vessel.tonnage}t
            </span>
          )}
        </div>

        {/* Broker link(s) */}
        <div className="mt-3 flex shrink-0 flex-wrap gap-2 lg:mt-0">
          {multiSource ? (
            vessel.linked_sources!.map((ls) => (
              <a
                key={ls.vessel_id}
                href={safeUrl(ls.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
              >
                {sourceLabel(ls.source)}
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            ))
          ) : (
            <a
              href={safeUrl(vessel.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Bekijk bij {sourceLabel(vessel.source)}
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Price history */}
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
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
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-800 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Terug naar overzicht
        </Link>
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

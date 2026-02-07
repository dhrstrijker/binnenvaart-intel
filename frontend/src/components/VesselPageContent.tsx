"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Vessel, PriceHistory, getSupabase } from "@/lib/supabase";
import { sourceLabel } from "@/lib/sources";
import PriceHistoryChart from "./PriceHistoryChart";
import PremiumGate from "./PremiumGate";
import VesselCard from "./VesselCard";
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

  return (
    <article>
      {/* Sold banner */}
      {vessel.status === "removed" && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
          <p className="text-sm font-semibold text-red-800">
            Dit schip is verkocht of niet meer beschikbaar.
          </p>
        </div>
      )}

      {/* Image */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-slate-100">
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
      </div>

      {/* Title + price */}
      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{vessel.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {sourceLabel(vessel.source)} &middot; Eerste keer gezien{" "}
            {formatDate(vessel.first_seen_at)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-extrabold text-slate-900">
            {formatPrice(vessel.price)}
          </p>
          {isPremium && priceChange !== null && priceChange !== 0 && (
            <p
              className={`text-xs font-semibold ${
                priceChange < 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {priceChange < 0 ? "" : "+"}
              {formatPrice(priceChange)} sinds eerste waarneming
            </p>
          )}
        </div>
      </div>

      {/* Specs grid */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SpecItem label="Type" value={vessel.type || "-"} />
        <SpecItem
          label="Afmetingen"
          value={
            vessel.length_m && vessel.width_m
              ? `${vessel.length_m} x ${vessel.width_m} m`
              : "-"
          }
        />
        <SpecItem label="Bouwjaar" value={vessel.build_year ? String(vessel.build_year) : "-"} />
        <SpecItem label="Tonnage" value={vessel.tonnage ? `${vessel.tonnage}t` : "-"} />
      </div>

      {/* Price history (premium only) */}
      <PremiumGate isPremium={isPremium}>
        {history.length >= 2 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-700">Prijsverloop</h2>
            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3" style={{ height: 160 }}>
              <PriceHistoryChart history={history} width={580} height={140} />
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-5">
            <h2 className="text-sm font-semibold text-slate-700">Prijswijzigingen</h2>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-100">
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
        )}
      </PremiumGate>

      {/* Cross-source comparison */}
      {vessel.linked_sources && vessel.linked_sources.length >= 2 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-700">Bronvergelijking</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Bron</th>
                  <th className="px-3 py-2 font-medium text-right">Prijs</th>
                  <th className="px-3 py-2 font-medium text-right">Link</th>
                </tr>
              </thead>
              <tbody>
                {vessel.linked_sources.map((ls) => (
                  <tr key={ls.vessel_id} className="border-b border-slate-50 last:border-b-0">
                    <td className="px-3 py-2 text-slate-700 font-medium">
                      {sourceLabel(ls.source)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">
                      {formatPrice(ls.price)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a
                        href={ls.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-cyan-600 hover:text-cyan-800"
                      >
                        Bekijken &rarr;
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Broker links */}
      <div className="mt-6 flex flex-wrap gap-2">
        {vessel.linked_sources && vessel.linked_sources.length >= 2 ? (
          vessel.linked_sources.map((ls) => (
            <a
              key={ls.vessel_id}
              href={ls.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
            >
              Bekijk op {sourceLabel(ls.source)}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          ))
        ) : (
          <a
            href={vessel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
          >
            Bekijk op {sourceLabel(vessel.source)}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        )}
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

      {/* Similar vessels for sold vessels */}
      {vessel.status === "removed" && similarVessels.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-slate-900">Vergelijkbare schepen</h2>
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

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

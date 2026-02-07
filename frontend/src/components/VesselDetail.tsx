"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { Vessel, PriceHistory } from "@/lib/supabase";
import { sourceLabel } from "@/lib/sources";
import PriceHistoryChart from "./PriceHistoryChart";
import PremiumGate from "./PremiumGate";

interface VesselDetailProps {
  vessel: Vessel;
  history: PriceHistory[];
  isPremium?: boolean;
  onClose: () => void;
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

export default function VesselDetail({ vessel, history, isPremium = false, onClose }: VesselDetailProps) {
  const [imgError, setImgError] = React.useState(false);

  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const priceChange =
    history.length >= 2
      ? history[history.length - 1].price - history[0].price
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-8">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-gray-100 animate-in fade-in zoom-in-95 my-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur-sm transition-colors hover:bg-white hover:text-slate-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Image */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-2xl bg-slate-100">
          {vessel.image_url && !imgError ? (
            <Image
              src={vessel.image_url}
              alt={vessel.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 672px"
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

        {/* Body */}
        <div className="p-5 sm:p-6">
          {/* Title + price */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{vessel.name}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {sourceLabel(vessel.source)} &middot; Eerste keer gezien{" "}
                {formatDate(vessel.first_seen_at)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-extrabold text-slate-900">
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
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

          {/* Price history chart (premium) */}
          <PremiumGate isPremium={isPremium}>
            {history.length >= 2 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-700">Prijsverloop</h3>
                <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3" style={{ height: 160 }}>
                  <PriceHistoryChart history={history} width={580} height={140} />
                </div>
              </div>
            )}

            {/* Price change log */}
            {history.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-700">Prijswijzigingen</h3>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-100">
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
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-700">Bronvergelijking</h3>
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

          {/* Link to original listing */}
          <div className="mt-5 flex flex-wrap gap-2">
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
        </div>
      </div>
    </div>
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

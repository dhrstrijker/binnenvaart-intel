"use client";

import React from "react";
import { Vessel } from "@/lib/supabase";
import { formatPrice } from "@/lib/formatting";
import { predictPriceRange, shouldSuppressPrediction, getConfidenceLevel } from "@/lib/vesselPricing";
import { computeDealScores } from "@/lib/dealScore";

interface StickyVesselInfoProps {
  vessel: Vessel;
}

export default function StickyVesselInfo({ vessel }: StickyVesselInfoProps) {
  const specs: { label: string; value: string; icon: React.ReactNode }[] = [];

  if (vessel.length_m) {
    specs.push({
      label: "Lengte",
      value: `${vessel.length_m}m`,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l-3 3m3-3l3 3m-3-3v16m0 0l-3-3m3 3l3-3" />
        </svg>
      ),
    });
  }

  if (vessel.width_m) {
    specs.push({
      label: "Breedte",
      value: `${vessel.width_m}m`,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 12l3-3m-3 3l3 3m-3-3h16m0 0l-3-3m3 3l-3 3" />
        </svg>
      ),
    });
  }

  if (vessel.tonnage) {
    specs.push({
      label: "Tonnage",
      value: `${vessel.tonnage.toLocaleString("nl-NL")}t`,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
        </svg>
      ),
    });
  }

  if (vessel.build_year) {
    specs.push({
      label: "Bouwjaar",
      value: String(vessel.build_year),
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
    });
  }

  // Market range data
  const showMarketRange = vessel.price !== null && !shouldSuppressPrediction(vessel);
  const range = showMarketRange ? predictPriceRange(vessel) : null;
  const pct = range && vessel.price !== null
    ? Math.max(0, Math.min(100, ((vessel.price - range.low) / (range.high - range.low)) * 100))
    : null;
  const scores = showMarketRange ? computeDealScores([vessel]) : null;
  const score = scores?.get(vessel.id);
  const confidence = showMarketRange ? getConfidenceLevel(vessel) : null;


  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      {/* Name + type */}
      <h2 className="text-lg font-bold text-slate-900 leading-tight">
        {vessel.name}
      </h2>
      {vessel.type && (
        <p className="mt-1 text-sm text-slate-500">{vessel.type}</p>
      )}

      {/* Price */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        {vessel.price !== null ? (
          <p className="text-2xl font-extrabold text-slate-900">
            {formatPrice(vessel.price)}
          </p>
        ) : (() => {
          const predicted = predictPriceRange(vessel);
          return predicted ? (
            <p className="text-xl font-extrabold text-slate-400 italic">
              {formatPrice(predicted.low)} – {formatPrice(predicted.high)}
            </p>
          ) : (
            <p className="text-lg font-bold text-slate-600">Prijs op aanvraag</p>
          );
        })()}
      </div>

      {/* Market range bar */}
      {range && pct !== null && (
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
      )}

      {/* Specs grid */}
      {specs.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {specs.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100"
            >
              <span className="text-slate-400">{s.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{s.value}</p>
                <p className="text-[11px] text-slate-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

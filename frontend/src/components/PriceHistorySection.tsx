"use client";

import React, { useState } from "react";
import { Vessel, PriceHistory } from "@/lib/supabase";
import PriceHistoryChart from "./PriceHistoryChart";
import { MiniSparkline } from "./PriceHistoryChart";
import PremiumGate from "./PremiumGate";
import { formatPrice, formatDate } from "@/lib/formatting";

interface PriceHistorySectionProps {
  vessel: Vessel;
  history: PriceHistory[];
  isPremium: boolean;
}

export default function PriceHistorySection({
  vessel,
  history,
  isPremium,
}: PriceHistorySectionProps) {
  const [priceExpanded, setPriceExpanded] = useState(false);

  const priceChange =
    history.length >= 2
      ? history[history.length - 1].price - history[0].price
      : null;

  const priceChangePercent =
    history.length >= 2 && history[0].price !== 0
      ? ((history[history.length - 1].price - history[0].price) / history[0].price) * 100
      : null;

  // Don't render if there's nothing to show
  const shouldRender = isPremium ? history.length >= 2 : true;
  if (!shouldRender) return null;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Prijsverloop</p>
          <div className="flex items-center gap-2">
            {vessel.price !== null ? (
              <span className="text-2xl font-extrabold text-slate-900">
                {formatPrice(vessel.price)}
              </span>
            ) : (
              <span className="text-2xl font-extrabold text-slate-900">Prijs op aanvraag</span>
            )}
            {isPremium && history.length >= 2 && <MiniSparkline history={history} />}
          </div>
          {/* Premium: % change since first observation */}
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
        </div>

        {/* Expand/collapse toggle */}
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

      {/* Collapsible price history chart + table */}
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

      {/* Non-premium: upsell */}
      {!isPremium && !priceExpanded && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <PremiumGate isPremium={false}><></></PremiumGate>
        </div>
      )}
    </div>
  );
}

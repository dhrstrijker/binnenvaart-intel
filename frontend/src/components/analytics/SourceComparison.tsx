"use client";

import { Vessel } from "@/lib/supabase";
import { sourceLabel as sharedSourceLabel, sourceColor } from "@/lib/sources";

interface SourceComparisonProps {
  vessels: Vessel[];
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function sourceLabel(source: string): string {
  return sharedSourceLabel(source);
}

interface SourceStats {
  source: string;
  label: string;
  count: number;
  withPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  avgLength: number;
  avgWidth: number;
  avgAge: number;
}

function computeStats(vessels: Vessel[], source: string): SourceStats {
  const sv = vessels.filter((v) => v.source === source);
  const withPrice = sv.filter((v) => v.price !== null && v.price > 0);
  const prices = withPrice.map((v) => v.price!);
  const withLength = sv.filter((v) => v.length_m !== null && v.length_m > 0);
  const withWidth = sv.filter((v) => v.width_m !== null && v.width_m > 0);
  const currentYear = new Date().getFullYear();
  const withYear = sv.filter((v) => v.build_year !== null && v.build_year > 0);

  return {
    source,
    label: sourceLabel(source),
    count: sv.length,
    withPrice: withPrice.length,
    avgPrice:
      prices.length > 0
        ? prices.reduce((s, p) => s + p, 0) / prices.length
        : 0,
    minPrice: prices.length > 0 ? Math.min(...prices) : 0,
    maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
    avgLength:
      withLength.length > 0
        ? withLength.reduce((s, v) => s + v.length_m!, 0) / withLength.length
        : 0,
    avgWidth:
      withWidth.length > 0
        ? withWidth.reduce((s, v) => s + v.width_m!, 0) / withWidth.length
        : 0,
    avgAge:
      withYear.length > 0
        ? withYear.reduce((s, v) => s + (currentYear - v.build_year!), 0) /
          withYear.length
        : 0,
  };
}

export default function SourceComparison({ vessels }: SourceComparisonProps) {
  const sources = Array.from(new Set(vessels.map((v) => v.source))).sort();
  const stats = sources.map((s) => computeStats(vessels, s));

  const colors = ["border-sky-400 bg-sky-50", "border-amber-400 bg-amber-50", "border-emerald-400 bg-emerald-50", "border-violet-400 bg-violet-50"];
  const headerColors = ["bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800", "bg-violet-100 text-violet-800"];

  const rows: { label: string; getValue: (s: SourceStats) => string }[] = [
    { label: "Aantal schepen", getValue: (s) => String(s.count) },
    {
      label: "Met prijsinfo",
      getValue: (s) => `${s.withPrice} (${s.count > 0 ? Math.round((s.withPrice / s.count) * 100) : 0}%)`,
    },
    {
      label: "Gem. prijs",
      getValue: (s) => (s.avgPrice > 0 ? formatEur(s.avgPrice) : "-"),
    },
    {
      label: "Laagste prijs",
      getValue: (s) => (s.minPrice > 0 ? formatEur(s.minPrice) : "-"),
    },
    {
      label: "Hoogste prijs",
      getValue: (s) => (s.maxPrice > 0 ? formatEur(s.maxPrice) : "-"),
    },
    {
      label: "Gem. lengte",
      getValue: (s) =>
        s.avgLength > 0 ? `${s.avgLength.toFixed(1)} m` : "-",
    },
    {
      label: "Gem. breedte",
      getValue: (s) =>
        s.avgWidth > 0 ? `${s.avgWidth.toFixed(1)} m` : "-",
    },
    {
      label: "Gem. leeftijd",
      getValue: (s) =>
        s.avgAge > 0 ? `${Math.round(s.avgAge)} jaar` : "-",
    },
  ];

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-4 text-lg font-bold text-slate-900">
        Vergelijking per makelaar
      </h2>
      {stats.length === 0 ? (
        <p className="text-sm text-slate-400">Geen gegevens beschikbaar</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  &nbsp;
                </th>
                {stats.map((s, i) => (
                  <th key={s.source} className="pb-3 text-center">
                    <span
                      className={`inline-block rounded-md px-3 py-1 text-xs font-semibold ${headerColors[i % headerColors.length]}`}
                    >
                      {s.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={row.label}
                  className={ri % 2 === 0 ? "bg-slate-50" : ""}
                >
                  <td className="whitespace-nowrap py-2.5 pr-4 text-xs font-medium text-slate-600">
                    {row.label}
                  </td>
                  {stats.map((s, i) => (
                    <td
                      key={s.source}
                      className={`py-2.5 text-center text-sm font-semibold text-slate-800`}
                    >
                      {row.getValue(s)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Visual bar comparison for vessel count */}
          <div className="mt-5 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Verdeling aantal schepen
            </p>
            {stats.map((s, i) => {
              const maxCount = Math.max(...stats.map((st) => st.count), 1);
              const pct = (s.count / maxCount) * 100;
              const barColors = ["bg-sky-400", "bg-amber-400", "bg-emerald-400", "bg-violet-400"];
              const barColor = barColors[i % barColors.length];
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs font-medium text-slate-600">
                    {s.label}
                  </span>
                  <div className="flex-1 rounded-full bg-slate-100 h-5">
                    <div
                      className={`h-5 rounded-full ${barColor} flex items-center justify-end pr-2 transition-all`}
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    >
                      <span className="text-[10px] font-bold text-white">
                        {s.count}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

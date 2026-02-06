"use client";

import { Vessel } from "@/lib/supabase";

interface CompetitivePositionProps {
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function rangeStr(min: number | null, max: number | null, suffix = ""): string {
  if (min == null && max == null) return "-";
  if (min == null) return `${max}${suffix}`;
  if (max == null) return `${min}${suffix}`;
  if (min === max) return `${min}${suffix}`;
  return `${min}-${max}${suffix}`;
}

export default function CompetitivePosition({ vessels }: CompetitivePositionProps) {
  // 1. Filter: vessels with price > 0 and type defined
  const valid = vessels.filter((v) => v.price && v.price > 0 && v.type);

  // 2. Group by type
  const typeGroups = new Map<
    string,
    { prices: number[]; lengths: number[]; buildYears: number[] }
  >();
  for (const v of valid) {
    const t = v.type!;
    if (!typeGroups.has(t)) {
      typeGroups.set(t, { prices: [], lengths: [], buildYears: [] });
    }
    const g = typeGroups.get(t)!;
    g.prices.push(v.price!);
    if (v.length_m != null) g.lengths.push(v.length_m);
    if (v.build_year != null) g.buildYears.push(v.build_year);
  }

  // 3. Only types with 3+ vessels, compute stats
  const segments = Array.from(typeGroups.entries())
    .filter(([, g]) => g.prices.length >= 3)
    .map(([type, g]) => ({
      type,
      count: g.prices.length,
      lengthMin: g.lengths.length > 0 ? Math.round(Math.min(...g.lengths)) : null,
      lengthMax: g.lengths.length > 0 ? Math.round(Math.max(...g.lengths)) : null,
      yearMin: g.buildYears.length > 0 ? Math.min(...g.buildYears) : null,
      yearMax: g.buildYears.length > 0 ? Math.max(...g.buildYears) : null,
      medianPrice: Math.round(median(g.prices)),
      priceMin: Math.round(Math.min(...g.prices)),
      priceMax: Math.round(Math.max(...g.prices)),
    }))
    .sort((a, b) => b.count - a.count);

  // Empty state
  if (segments.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Concurrentiepositie</h2>
        <p className="text-sm text-slate-400">
          Onvoldoende gegevens voor concurrentiepositie-overzicht.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Concurrentiepositie</h2>
      <p className="mb-4 text-xs text-slate-400">
        Marktsegmenten per scheepstype &mdash; vind uw concurrentie
      </p>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
              <th className="pb-2 pr-3">Type</th>
              <th className="pb-2 pr-3">Aantal</th>
              <th className="pb-2 pr-3">Lengte</th>
              <th className="pb-2 pr-3">Bouwjaar</th>
              <th className="pb-2 pr-3 text-right">Mediaan prijs</th>
              <th className="pb-2 text-right">Prijsbereik</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.type} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-medium text-slate-800">{s.type}</td>
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                    {s.count}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-600">
                  {rangeStr(s.lengthMin, s.lengthMax, "m")}
                </td>
                <td className="py-2 pr-3 text-slate-600">
                  {rangeStr(s.yearMin, s.yearMax)}
                </td>
                <td className="py-2 pr-3 text-right font-semibold text-slate-800">
                  {formatEur(s.medianPrice)}
                </td>
                <td className="py-2 text-right text-slate-600">
                  {formatEur(s.priceMin)} - {formatEur(s.priceMax)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { Vessel } from "@/lib/supabase";

interface PricePerMeterProps {
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

const BAR_COLORS = [
  "fill-blue-500",
  "fill-sky-500",
  "fill-teal-500",
  "fill-emerald-500",
  "fill-amber-500",
  "fill-orange-500",
  "fill-rose-500",
  "fill-purple-500",
];

export default function PricePerMeter({ vessels }: PricePerMeterProps) {
  // Group by type, compute median price per meter
  const typeGroups = new Map<string, number[]>();
  for (const v of vessels) {
    if (!v.price || v.price <= 0 || !v.length_m || v.length_m <= 0) continue;
    const t = v.type || "Onbekend";
    const ppm = v.price / v.length_m;
    const arr = typeGroups.get(t) ?? [];
    arr.push(ppm);
    typeGroups.set(t, arr);
  }

  const typeStats = Array.from(typeGroups.entries())
    .map(([type, vals]) => ({
      type,
      medianPpm: Math.round(median(vals)),
      minPpm: Math.round(Math.min(...vals)),
      maxPpm: Math.round(Math.max(...vals)),
      count: vals.length,
    }))
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.medianPpm - a.medianPpm);

  if (typeStats.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Prijs per meter</h2>
        <p className="text-sm text-slate-400">Onvoldoende gegevens</p>
      </div>
    );
  }

  const maxPpm = Math.max(...typeStats.map((s) => s.medianPpm), 1);

  const barHeight = 28;
  const gap = 6;
  const labelWidth = 140;
  const chartWidth = 400;
  const svgHeight = typeStats.length * (barHeight + gap) - gap;

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Prijs per meter</h2>
      <p className="mb-4 text-xs text-slate-400">
        Mediaan vraagprijs per meter lengte per scheepstype
      </p>
      <svg
        viewBox={`0 0 ${labelWidth + chartWidth + 120} ${svgHeight}`}
        className="w-full"
        role="img"
        aria-label="Prijs per meter per scheepstype"
      >
        {typeStats.map((s, i) => {
          const y = i * (barHeight + gap);
          const barW = (s.medianPpm / maxPpm) * chartWidth;
          const color = BAR_COLORS[i % BAR_COLORS.length];

          return (
            <g key={s.type}>
              <text
                x={labelWidth - 8}
                y={y + barHeight / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-slate-600 text-[12px] font-medium"
              >
                {s.type}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={chartWidth}
                height={barHeight}
                rx={5}
                className="fill-slate-100"
              />
              {barW > 0 && (
                <rect
                  x={labelWidth}
                  y={y}
                  width={Math.max(barW, 4)}
                  height={barHeight}
                  rx={5}
                  className={color}
                />
              )}
              <text
                x={labelWidth + Math.max(barW, 4) + 8}
                y={y + barHeight / 2}
                dominantBaseline="central"
                className="fill-slate-700 text-[12px] font-bold"
              >
                {formatEur(s.medianPpm)}/m
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

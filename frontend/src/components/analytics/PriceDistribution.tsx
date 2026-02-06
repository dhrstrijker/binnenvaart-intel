"use client";

import { Vessel } from "@/lib/supabase";

interface TimeOnMarketProps {
  vessels: Vessel[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export default function TimeOnMarket({ vessels }: TimeOnMarketProps) {
  const now = new Date();

  // Group by type, compute median days on market per type
  const typeGroups = new Map<string, number[]>();
  for (const v of vessels) {
    const t = v.type || "Onbekend";
    const days = Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(v.first_seen_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const arr = typeGroups.get(t) ?? [];
    arr.push(days);
    typeGroups.set(t, arr);
  }

  const typeStats = Array.from(typeGroups.entries())
    .map(([type, days]) => ({
      type,
      medianDays: Math.round(median(days)),
      count: days.length,
    }))
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.medianDays - a.medianDays);

  if (typeStats.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Tijd op de markt</h2>
        <p className="text-sm text-slate-400">Onvoldoende gegevens</p>
      </div>
    );
  }

  const maxDays = Math.max(...typeStats.map((s) => s.medianDays), 1);

  const barHeight = 28;
  const gap = 6;
  const labelWidth = 140;
  const chartWidth = 400;
  const svgHeight = typeStats.length * (barHeight + gap) - gap;

  function barColor(days: number): string {
    if (days <= 14) return "fill-emerald-400";
    if (days <= 30) return "fill-emerald-500";
    if (days <= 60) return "fill-amber-400";
    if (days <= 90) return "fill-amber-500";
    return "fill-red-400";
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Tijd op de markt</h2>
      <p className="mb-4 text-xs text-slate-400">
        Mediaan dagen te koop per scheepstype (langer = moeilijker te verkopen)
      </p>
      <svg
        viewBox={`0 0 ${labelWidth + chartWidth + 80} ${svgHeight}`}
        className="w-full"
        role="img"
        aria-label="Tijd op de markt per scheepstype"
      >
        {typeStats.map((s, i) => {
          const y = i * (barHeight + gap);
          const barW = (s.medianDays / maxDays) * chartWidth;

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
                  className={barColor(s.medianDays)}
                />
              )}
              <text
                x={labelWidth + Math.max(barW, 4) + 8}
                y={y + barHeight / 2}
                dominantBaseline="central"
                className="fill-slate-700 text-[12px] font-bold"
              >
                {s.medianDays} dagen
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

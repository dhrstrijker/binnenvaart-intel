"use client";

import { Vessel } from "@/lib/supabase";

interface SupplyByTypeProps {
  vessels: Vessel[];
}

const TYPE_COLORS = [
  "fill-blue-500",
  "fill-sky-500",
  "fill-teal-500",
  "fill-emerald-500",
  "fill-amber-500",
  "fill-orange-500",
  "fill-rose-500",
  "fill-purple-500",
];

export default function SupplyByType({ vessels }: SupplyByTypeProps) {
  const typeCounts = new Map<string, number>();
  for (const v of vessels) {
    const t = v.type || "Onbekend";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }

  const sorted = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
  const total = vessels.length;

  const barHeight = 28;
  const gap = 6;
  const labelWidth = 140;
  const chartWidth = 400;
  const svgHeight = sorted.length * (barHeight + gap) - gap;

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-bold text-slate-900">
        Aanbod per scheepstype
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        Aandeel van elk type in het totale aanbod
      </p>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400">Geen gegevens beschikbaar</p>
      ) : (
        <svg
          viewBox={`0 0 ${labelWidth + chartWidth + 100} ${svgHeight}`}
          className="w-full"
          role="img"
          aria-label="Aanbod per scheepstype"
        >
          {sorted.map(([type, count], i) => {
            const y = i * (barHeight + gap);
            const pct = total > 0 ? (count / total) * 100 : 0;
            const barW = (pct / 100) * chartWidth;
            const color = TYPE_COLORS[i % TYPE_COLORS.length];

            return (
              <g key={type}>
                <text
                  x={labelWidth - 8}
                  y={y + barHeight / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-slate-600 text-[12px] font-medium"
                >
                  {type}
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
                  {count} ({pct.toFixed(0)}%)
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

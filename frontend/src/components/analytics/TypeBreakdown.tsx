"use client";

import { Vessel } from "@/lib/supabase";

interface TypeBreakdownProps {
  vessels: Vessel[];
}

const TYPE_COLORS = [
  { bar: "fill-blue-500", bg: "bg-blue-500" },
  { bar: "fill-sky-500", bg: "bg-sky-500" },
  { bar: "fill-teal-500", bg: "bg-teal-500" },
  { bar: "fill-emerald-500", bg: "bg-emerald-500" },
  { bar: "fill-amber-500", bg: "bg-amber-500" },
  { bar: "fill-orange-500", bg: "bg-orange-500" },
  { bar: "fill-rose-500", bg: "bg-rose-500" },
  { bar: "fill-purple-500", bg: "bg-purple-500" },
  { bar: "fill-indigo-500", bg: "bg-indigo-500" },
  { bar: "fill-cyan-500", bg: "bg-cyan-500" },
];

export default function TypeBreakdown({ vessels }: TypeBreakdownProps) {
  const typeCounts = new Map<string, number>();
  for (const v of vessels) {
    const t = v.type || "Onbekend";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }

  const sorted = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  const maxCount = Math.max(...sorted.map(([, c]) => c), 1);
  const total = vessels.length;

  const barHeight = 28;
  const gap = 6;
  const labelWidth = 140;
  const chartWidth = 400;
  const svgHeight = sorted.length * (barHeight + gap) - gap;

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-4 text-lg font-bold text-slate-900">
        Scheepstypen
      </h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400">Geen gegevens beschikbaar</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${labelWidth + chartWidth + 80} ${svgHeight}`}
            className="w-full"
            role="img"
            aria-label="Scheepstypen staafdiagram"
          >
            {sorted.map(([type, count], i) => {
              const y = i * (barHeight + gap);
              const barW = (count / maxCount) * chartWidth;
              const color = TYPE_COLORS[i % TYPE_COLORS.length];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;

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
                      width={barW}
                      height={barHeight}
                      rx={5}
                      className={color.bar}
                    />
                  )}
                  <text
                    x={labelWidth + barW + 8}
                    y={y + barHeight / 2}
                    dominantBaseline="central"
                    className="fill-slate-700 text-[12px] font-bold"
                  >
                    {count} ({pct}%)
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            {sorted.slice(0, 8).map(([type], i) => (
              <div key={type} className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-3 w-3 rounded-sm ${TYPE_COLORS[i % TYPE_COLORS.length].bg}`}
                />
                <span className="text-xs text-slate-600">{type}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

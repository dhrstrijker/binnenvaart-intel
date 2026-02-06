"use client";

import { Vessel } from "@/lib/supabase";

interface SupplyByTypeProps {
  vessels: Vessel[];
}

const TYPE_COLORS = [
  "#3b82f6", // blue-500
  "#0ea5e9", // sky-500
  "#14b8a6", // teal-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#64748b", // slate-500 (Overig)
];

const MONTH_NAMES = [
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
];

export default function SupplyByType({ vessels }: SupplyByTypeProps) {
  // 1. Count per type (all vessels)
  const typeTotals = new Map<string, number>();
  for (const v of vessels) {
    const t = v.type || "Onbekend";
    typeTotals.set(t, (typeTotals.get(t) ?? 0) + 1);
  }

  // 2. Top 5 types by count, rest = "Overig"
  const sortedTypes = Array.from(typeTotals.entries()).sort((a, b) => b[1] - a[1]);
  const top5 = sortedTypes.slice(0, 5).map(([t]) => t);
  const categories = [...top5, "Overig"];

  // 3. Group vessels by first_seen_at month + type category
  const monthTypeMap = new Map<string, Map<string, number>>();
  for (const v of vessels) {
    const d = new Date(v.first_seen_at);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const rawType = v.type || "Onbekend";
    const cat = top5.includes(rawType) ? rawType : "Overig";

    if (!monthTypeMap.has(monthKey)) {
      monthTypeMap.set(monthKey, new Map());
    }
    const typeMap = monthTypeMap.get(monthKey)!;
    typeMap.set(cat, (typeMap.get(cat) ?? 0) + 1);
  }

  // 4. Sort months chronologically
  const months = Array.from(monthTypeMap.keys()).sort();

  // Empty state
  if (months.length < 2) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Aanbod trend per type</h2>
        <p className="text-sm text-slate-400">
          Nog onvoldoende data voor trendweergave.
        </p>
      </div>
    );
  }

  // 5. Build stacked data
  const monthData = months.map((monthKey) => {
    const typeMap = monthTypeMap.get(monthKey)!;
    const counts: Record<string, number> = {};
    let total = 0;
    for (const cat of categories) {
      const c = typeMap.get(cat) ?? 0;
      counts[cat] = c;
      total += c;
    }
    const [year, month] = monthKey.split("-");
    return {
      key: monthKey,
      label: `${MONTH_NAMES[parseInt(month) - 1]} '${year.slice(2)}`,
      counts,
      total,
    };
  });

  const maxTotal = Math.max(...monthData.map((m) => m.total), 1);

  // SVG dimensions
  const chartWidth = 500;
  const chartHeight = 260;
  const padding = { top: 16, right: 10, bottom: 44, left: 36 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const barGap = 6;
  const barWidth = Math.max(
    16,
    (innerWidth - barGap * (monthData.length - 1)) / monthData.length
  );
  const totalBarWidth = barWidth * monthData.length + barGap * (monthData.length - 1);
  const xOffset = padding.left + (innerWidth - totalBarWidth) / 2;

  // Y-axis grid
  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    Math.round((maxTotal * i) / (yTicks - 1))
  );

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Aanbod trend per type</h2>
      <p className="mb-4 text-xs text-slate-400">
        Nieuwe listings per maand, uitgesplitst naar scheepstype
      </p>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        role="img"
        aria-label="Aanbod trend per scheepstype"
      >
        {/* Y-axis grid lines */}
        {yTickValues.map((val) => {
          const y = padding.top + (1 - val / maxTotal) * innerHeight;
          return (
            <g key={val}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-slate-500 text-[10px]"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Stacked bars */}
        {monthData.map((m, mi) => {
          const x = xOffset + mi * (barWidth + barGap);
          let yAcc = padding.top + innerHeight; // bottom of chart

          return (
            <g key={m.key}>
              {categories.map((cat, ci) => {
                const count = m.counts[cat] ?? 0;
                if (count === 0) return null;
                const segH = (count / maxTotal) * innerHeight;
                yAcc -= segH;
                return (
                  <rect
                    key={cat}
                    x={x}
                    y={yAcc}
                    width={barWidth}
                    height={segH}
                    rx={ci === categories.length - 1 || yAcc === padding.top + innerHeight - (m.total / maxTotal) * innerHeight ? 2 : 0}
                    fill={TYPE_COLORS[ci]}
                  />
                );
              })}
              {/* Total label above bar */}
              <text
                x={x + barWidth / 2}
                y={padding.top + innerHeight - (m.total / maxTotal) * innerHeight - 5}
                textAnchor="middle"
                className="fill-slate-600 text-[9px] font-medium"
              >
                {m.total}
              </text>
              {/* Month label */}
              <text
                x={x + barWidth / 2}
                y={padding.top + innerHeight + 16}
                textAnchor="middle"
                className="fill-slate-500 text-[9px]"
                transform={
                  monthData.length > 6
                    ? `rotate(-45, ${x + barWidth / 2}, ${padding.top + innerHeight + 16})`
                    : undefined
                }
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {categories.map((cat, i) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[i] }}
            />
            <span className="text-xs text-slate-600">{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

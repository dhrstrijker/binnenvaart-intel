"use client";

import { Vessel } from "@/lib/supabase";

interface MarketFlowProps {
  vessels: Vessel[];
}

export default function MarketFlow({ vessels }: MarketFlowProps) {
  // Group vessels by first_seen_at month
  const monthly = new Map<string, number>();
  for (const v of vessels) {
    const d = new Date(v.first_seen_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) ?? 0) + 1);
  }

  const monthNames = [
    "jan", "feb", "mrt", "apr", "mei", "jun",
    "jul", "aug", "sep", "okt", "nov", "dec",
  ];

  const dataPoints = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [year, month] = key.split("-");
      return {
        key,
        label: `${monthNames[parseInt(month) - 1]} '${year.slice(2)}`,
        count,
      };
    });

  if (dataPoints.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Nieuwe aanbiedingen</h2>
        <p className="text-sm text-slate-400">Geen gegevens beschikbaar</p>
      </div>
    );
  }

  const maxCount = Math.max(...dataPoints.map((d) => d.count), 1);

  // Vertical bar chart
  const padding = { top: 20, right: 10, bottom: 50, left: 40 };
  const chartWidth = 500;
  const chartHeight = 220;
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const barGap = 4;
  const barWidth = Math.max(
    8,
    (innerWidth - barGap * (dataPoints.length - 1)) / dataPoints.length
  );
  const totalBarWidth = barWidth * dataPoints.length + barGap * (dataPoints.length - 1);
  const xOffset = padding.left + (innerWidth - totalBarWidth) / 2;

  // Y-axis ticks
  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    Math.round((maxCount * i) / (yTicks - 1))
  );

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Nieuwe aanbiedingen</h2>
      <p className="mb-4 text-xs text-slate-400">
        Aantal nieuwe listings per maand (stijgend = groeiend aanbod)
      </p>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        role="img"
        aria-label="Nieuwe aanbiedingen per maand"
      >
        {/* Y-axis grid lines */}
        {yTickValues.map((val) => {
          const y = padding.top + (1 - val / maxCount) * innerHeight;
          return (
            <g key={val}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                className="stroke-slate-200"
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

        {/* Bars */}
        {dataPoints.map((d, i) => {
          const x = xOffset + i * (barWidth + barGap);
          const barH = (d.count / maxCount) * innerHeight;
          const y = padding.top + innerHeight - barH;

          return (
            <g key={d.key}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={3}
                className="fill-blue-500"
              />
              {/* Count label above bar */}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-slate-600 text-[9px] font-medium"
              >
                {d.count}
              </text>
              {/* Month label */}
              <text
                x={x + barWidth / 2}
                y={padding.top + innerHeight + 16}
                textAnchor="middle"
                className="fill-slate-500 text-[9px]"
                transform={
                  dataPoints.length > 6
                    ? `rotate(-45, ${x + barWidth / 2}, ${padding.top + innerHeight + 16})`
                    : undefined
                }
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

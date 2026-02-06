"use client";

import { Vessel, PriceHistory } from "@/lib/supabase";

interface PriceTrendsProps {
  priceHistory: PriceHistory[];
  vessels: Vessel[];
}

function formatEur(value: number): string {
  if (value >= 1_000_000) {
    return `\u20AC${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `\u20AC${Math.round(value / 1_000)}k`;
  }
  return `\u20AC${Math.round(value)}`;
}

const LINE_COLORS = [
  { stroke: "stroke-cyan-500", fill: "fill-cyan-500", dot: "bg-cyan-500" },
  { stroke: "stroke-emerald-500", fill: "fill-emerald-500", dot: "bg-emerald-500" },
  { stroke: "stroke-amber-500", fill: "fill-amber-500", dot: "bg-amber-500" },
  { stroke: "stroke-rose-500", fill: "fill-rose-500", dot: "bg-rose-500" },
  { stroke: "stroke-purple-500", fill: "fill-purple-500", dot: "bg-purple-500" },
];

export default function PriceTrends({ priceHistory, vessels }: PriceTrendsProps) {
  // Build vessel_id -> type lookup
  const vesselTypeMap = new Map<string, string>();
  for (const v of vessels) {
    vesselTypeMap.set(v.id, v.type || "Onbekend");
  }

  // Find top 5 vessel types by count (for price trends)
  const typeCounts = new Map<string, number>();
  for (const v of vessels) {
    const t = v.type || "Onbekend";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const topTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  // Group price_history by type + month
  const typeMonthly = new Map<string, Map<string, number[]>>();
  for (const t of topTypes) {
    typeMonthly.set(t, new Map());
  }

  for (const ph of priceHistory) {
    const type = vesselTypeMap.get(ph.vessel_id);
    if (!type || !topTypes.includes(type)) continue;

    const d = new Date(ph.recorded_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const monthMap = typeMonthly.get(type)!;
    const arr = monthMap.get(key) ?? [];
    arr.push(ph.price);
    monthMap.set(key, arr);
  }

  // Collect all months across all types
  const allMonths = new Set<string>();
  for (const monthMap of typeMonthly.values()) {
    for (const key of monthMap.keys()) {
      allMonths.add(key);
    }
  }
  const sortedMonths = Array.from(allMonths).sort();

  if (sortedMonths.length < 2) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-1 text-lg font-bold text-slate-900">
          Prijstrends per scheepstype
        </h2>
        <p className="text-sm text-slate-400">
          Nog onvoldoende prijshistorie. Trends worden zichtbaar zodra er
          prijswijzigingen over meerdere maanden worden geregistreerd.
        </p>
      </div>
    );
  }

  // Build data series per type
  type DataSeries = { type: string; points: { month: string; avgPrice: number }[] };
  const series: DataSeries[] = [];

  for (const type of topTypes) {
    const monthMap = typeMonthly.get(type)!;
    const points: { month: string; avgPrice: number }[] = [];
    for (const month of sortedMonths) {
      const prices = monthMap.get(month);
      if (prices && prices.length > 0) {
        const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
        points.push({ month, avgPrice: avg });
      }
    }
    if (points.length >= 2) {
      series.push({ type, points });
    }
  }

  if (series.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-1 text-lg font-bold text-slate-900">
          Prijstrends per scheepstype
        </h2>
        <p className="text-sm text-slate-400">
          Nog onvoldoende prijshistorie per type. Trends worden zichtbaar zodra
          er prijswijzigingen over meerdere maanden worden geregistreerd.
        </p>
      </div>
    );
  }

  // SVG layout
  const padding = { top: 30, right: 20, bottom: 50, left: 70 };
  const chartWidth = 700;
  const chartHeight = 300;
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Y-axis: global min/max across all series
  const allPrices = series.flatMap((s) => s.points.map((p) => p.avgPrice));
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;
  const yPad = priceRange * 0.1;
  const yMin = minPrice - yPad;
  const yMax = maxPrice + yPad;
  const yRange = yMax - yMin;

  // X-axis: month indices
  const monthToX = (month: string) => {
    const idx = sortedMonths.indexOf(month);
    return padding.left + (idx / Math.max(sortedMonths.length - 1, 1)) * innerWidth;
  };
  const priceToY = (price: number) =>
    padding.top + (1 - (price - yMin) / yRange) * innerHeight;

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    yMin + (yRange * i) / (yTicks - 1)
  );

  // Month labels
  const monthNames = [
    "jan", "feb", "mrt", "apr", "mei", "jun",
    "jul", "aug", "sep", "okt", "nov", "dec",
  ];
  function formatMonth(key: string): string {
    const [year, month] = key.split("-");
    return `${monthNames[parseInt(month) - 1]} '${year.slice(2)}`;
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-bold text-slate-900">
        Prijstrends per scheepstype
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        Gemiddelde vraagprijs per maand voor de meest voorkomende scheepstypen
      </p>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        role="img"
        aria-label="Prijstrends per scheepstype"
      >
        {/* Grid lines */}
        {yTickValues.map((val) => {
          const y = priceToY(val);
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
                x={padding.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-slate-500 text-[10px]"
              >
                {formatEur(val)}
              </text>
            </g>
          );
        })}

        {/* Lines per type */}
        {series.map((s, si) => {
          const color = LINE_COLORS[si % LINE_COLORS.length];
          const pathD = s.points
            .map((p, i) => {
              const x = monthToX(p.month);
              const y = priceToY(p.avgPrice);
              return `${i === 0 ? "M" : "L"} ${x} ${y}`;
            })
            .join(" ");

          return (
            <g key={s.type}>
              <path
                d={pathD}
                fill="none"
                className={color.stroke}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={monthToX(p.month)}
                    cy={priceToY(p.avgPrice)}
                    r={4}
                    className={color.fill}
                  />
                  <circle
                    cx={monthToX(p.month)}
                    cy={priceToY(p.avgPrice)}
                    r={2}
                    className="fill-white"
                  />
                </g>
              ))}
            </g>
          );
        })}

        {/* X-axis labels */}
        {sortedMonths.map((month, i) => {
          if (sortedMonths.length > 8 && i % 2 !== 0 && i !== sortedMonths.length - 1) {
            return null;
          }
          return (
            <text
              key={month}
              x={monthToX(month)}
              y={padding.top + innerHeight + 20}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {formatMonth(month)}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4">
        {series.map((s, si) => (
          <div key={s.type} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-3 rounded-full ${LINE_COLORS[si % LINE_COLORS.length].dot}`}
            />
            <span className="text-xs text-slate-600">{s.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

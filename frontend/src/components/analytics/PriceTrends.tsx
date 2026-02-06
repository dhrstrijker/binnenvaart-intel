"use client";

import { PriceHistory } from "@/lib/supabase";

interface PriceTrendsProps {
  priceHistory: PriceHistory[];
}

interface DataPoint {
  label: string;
  avgPrice: number;
  count: number;
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

export default function PriceTrends({ priceHistory }: PriceTrendsProps) {
  // Group by month
  const monthly = new Map<string, { total: number; count: number }>();
  for (const ph of priceHistory) {
    const d = new Date(ph.recorded_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthly.get(key) ?? { total: 0, count: 0 };
    entry.total += ph.price;
    entry.count += 1;
    monthly.set(key, entry);
  }

  const dataPoints: DataPoint[] = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { total, count }]) => {
      const [year, month] = key.split("-");
      const monthNames = [
        "jan", "feb", "mrt", "apr", "mei", "jun",
        "jul", "aug", "sep", "okt", "nov", "dec",
      ];
      return {
        label: `${monthNames[parseInt(month) - 1]} '${year.slice(2)}`,
        avgPrice: total / count,
        count,
      };
    });

  if (dataPoints.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-4 text-lg font-bold text-slate-900">
          Prijstrends
        </h2>
        <p className="text-sm text-slate-400">
          Nog geen prijshistorie beschikbaar. Trends worden zichtbaar zodra er prijswijzigingen worden geregistreerd.
        </p>
      </div>
    );
  }

  const prices = dataPoints.map((d) => d.avgPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  // SVG dimensions
  const padding = { top: 30, right: 20, bottom: 50, left: 70 };
  const chartWidth = 600;
  const chartHeight = 250;
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Compute points
  const points = dataPoints.map((d, i) => ({
    x: padding.left + (i / Math.max(dataPoints.length - 1, 1)) * innerWidth,
    y: padding.top + (1 - (d.avgPrice - minPrice) / priceRange) * innerHeight,
    ...d,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Area fill
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => {
    return minPrice + (priceRange * i) / (yTicks - 1);
  });

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-4 text-lg font-bold text-slate-900">
        Prijstrends
      </h2>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        role="img"
        aria-label="Prijstrends lijndiagram"
      >
        {/* Grid lines */}
        {yTickValues.map((val) => {
          const y = padding.top + (1 - (val - minPrice) / priceRange) * innerHeight;
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

        {/* Area fill */}
        <path d={areaPath} className="fill-blue-500/10" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          className="stroke-blue-500"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} className="fill-blue-500" />
            <circle cx={p.x} cy={p.y} r={2} className="fill-white" />
          </g>
        ))}

        {/* X-axis labels */}
        {points.map((p, i) => {
          // Show every label if few points, else show every other
          if (dataPoints.length > 8 && i % 2 !== 0 && i !== dataPoints.length - 1) {
            return null;
          }
          return (
            <text
              key={i}
              x={p.x}
              y={padding.top + innerHeight + 20}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {p.label}
            </text>
          );
        })}

        {/* Price labels on points */}
        {points.length <= 12 &&
          points.map((p, i) => (
            <text
              key={`val-${i}`}
              x={p.x}
              y={p.y - 12}
              textAnchor="middle"
              className="fill-slate-600 text-[9px] font-medium"
            >
              {formatEur(p.avgPrice)}
            </text>
          ))}
      </svg>
    </div>
  );
}

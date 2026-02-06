"use client";

import { Vessel } from "@/lib/supabase";

interface PriceDistributionProps {
  vessels: Vessel[];
}

interface Bucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export default function PriceDistribution({ vessels }: PriceDistributionProps) {
  const withPrice = vessels.filter((v) => v.price !== null && v.price > 0);

  const buckets: Bucket[] = [
    { label: "< \u20AC100k", min: 0, max: 100_000, count: 0 },
    { label: "\u20AC100k - 500k", min: 100_000, max: 500_000, count: 0 },
    { label: "\u20AC500k - 1M", min: 500_000, max: 1_000_000, count: 0 },
    { label: "\u20AC1M - 2M", min: 1_000_000, max: 2_000_000, count: 0 },
    { label: "\u20AC2M - 5M", min: 2_000_000, max: 5_000_000, count: 0 },
    { label: "> \u20AC5M", min: 5_000_000, max: Infinity, count: 0 },
  ];

  for (const v of withPrice) {
    const price = v.price!;
    for (const bucket of buckets) {
      if (price >= bucket.min && price < bucket.max) {
        bucket.count++;
        break;
      }
    }
  }

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  const barColors = [
    "fill-blue-300",
    "fill-blue-400",
    "fill-blue-500",
    "fill-blue-600",
    "fill-blue-700",
    "fill-blue-800",
  ];

  const barHeight = 32;
  const gap = 8;
  const labelWidth = 120;
  const chartWidth = 500;
  const svgHeight = buckets.length * (barHeight + gap) - gap;

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-4 text-lg font-bold text-slate-900">
        Prijsverdeling
      </h2>
      {withPrice.length === 0 ? (
        <p className="text-sm text-slate-400">Geen prijsgegevens beschikbaar</p>
      ) : (
        <svg
          viewBox={`0 0 ${labelWidth + chartWidth + 60} ${svgHeight}`}
          className="w-full"
          role="img"
          aria-label="Prijsverdeling staafdiagram"
        >
          {buckets.map((bucket, i) => {
            const y = i * (barHeight + gap);
            const barW =
              maxCount > 0
                ? (bucket.count / maxCount) * chartWidth
                : 0;

            return (
              <g key={bucket.label}>
                {/* Label */}
                <text
                  x={labelWidth - 8}
                  y={y + barHeight / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-slate-600 text-[13px] font-medium"
                >
                  {bucket.label}
                </text>
                {/* Background bar */}
                <rect
                  x={labelWidth}
                  y={y}
                  width={chartWidth}
                  height={barHeight}
                  rx={6}
                  className="fill-slate-100"
                />
                {/* Value bar */}
                {barW > 0 && (
                  <rect
                    x={labelWidth}
                    y={y}
                    width={barW}
                    height={barHeight}
                    rx={6}
                    className={barColors[i]}
                  />
                )}
                {/* Count label */}
                <text
                  x={labelWidth + barW + 8}
                  y={y + barHeight / 2}
                  dominantBaseline="central"
                  className="fill-slate-700 text-[13px] font-bold"
                >
                  {bucket.count}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

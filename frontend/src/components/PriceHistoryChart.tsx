"use client";

import React from "react";
import { PriceHistory } from "@/lib/supabase";

interface PriceHistoryChartProps {
  history: PriceHistory[];
  width?: number;
  height?: number;
  showDots?: boolean;
  showLabels?: boolean;
}

function formatEur(price: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

export default function PriceHistoryChart({
  history,
  width = 320,
  height = 120,
  showDots = true,
  showLabels = true,
}: PriceHistoryChartProps) {
  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-slate-400">
        Geen prijsgeschiedenis beschikbaar
      </div>
    );
  }

  if (history.length === 1) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-slate-400">
        Slechts 1 prijspunt &mdash; {formatEur(history[0].price)} op{" "}
        {formatDate(history[0].recorded_at)}
      </div>
    );
  }

  const padding = { top: 16, right: 16, bottom: showLabels ? 28 : 8, left: 16 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const prices = history.map((h) => h.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const points = history.map((h, i) => ({
    x: padding.left + (i / (history.length - 1)) * chartW,
    y: padding.top + chartH - ((h.price - minP) / range) * chartH,
    price: h.price,
    date: h.recorded_at,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Gradient area path
  const areaPath = [
    `M ${points[0].x},${points[0].y}`,
    ...points.slice(1).map((p) => `L ${p.x},${p.y}`),
    `L ${points[points.length - 1].x},${padding.top + chartH}`,
    `L ${points[0].x},${padding.top + chartH}`,
    "Z",
  ].join(" ");

  const first = history[0].price;
  const last = history[history.length - 1].price;
  const color = last < first ? "#10b981" : last > first ? "#ef4444" : "#6b7280";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      className="overflow-visible"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`grad-${history[0].id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#grad-${history[0].id})`} />

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {showDots &&
        points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="white" stroke={color} strokeWidth={2} />
        ))}

      {/* X-axis labels */}
      {showLabels &&
        points
          .filter(
            (_, i) =>
              i === 0 || i === points.length - 1 || (points.length > 4 && i === Math.floor(points.length / 2))
          )
          .map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={height - 4}
              textAnchor="middle"
              className="fill-slate-400"
              fontSize={10}
            >
              {formatDate(p.date)}
            </text>
          ))}

      {/* Y-axis labels: min and max */}
      {showLabels && (
        <>
          <text
            x={padding.left - 2}
            y={padding.top + 4}
            textAnchor="start"
            className="fill-slate-400"
            fontSize={9}
          >
            {formatEur(maxP)}
          </text>
          <text
            x={padding.left - 2}
            y={padding.top + chartH - 2}
            textAnchor="start"
            className="fill-slate-400"
            fontSize={9}
          >
            {formatEur(minP)}
          </text>
        </>
      )}
    </svg>
  );
}

/** Compact sparkline variant for use inside VesselCard */
export function MiniSparkline({ history }: { history: PriceHistory[] }) {
  if (history.length < 2) return null;

  const w = 60;
  const h = 20;
  const prices = history.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const pts = history.map((p, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((p.price - minP) / range) * h;
    return `${x},${y}`;
  });

  const first = history[0].price;
  const last = history[history.length - 1].price;
  const color = last < first ? "#10b981" : last > first ? "#ef4444" : "#6b7280";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={60} height={20} className="inline-block">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

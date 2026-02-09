"use client";

import React from "react";
import type { TonnageByDepth } from "@/lib/rawDetails";

interface TonnageByDepthChartProps {
  data: TonnageByDepth[];
}

export default function TonnageByDepthChart({ data }: TonnageByDepthChartProps) {
  if (data.length === 0) return null;

  const W = 360;
  const H = data.length * 44 + 40;
  const barAreaX = 100;
  const barAreaW = W - barAreaX - 20;
  const barH = 28;
  const barGap = 44;
  const topPad = 20;

  const maxTonnage = Math.max(...data.map((d) => d.tonnage_t));

  // Color gradient: lighter at shallow depths, darker at deep
  function barColor(idx: number): string {
    const colors = ["#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2", "#0e7490", "#155e75"];
    return colors[Math.min(idx, colors.length - 1)];
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible" style={{ maxWidth: 360 }}>
      {/* Header */}
      <text x={barAreaX + barAreaW / 2} y={12} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight={500}>
        Tonnage (t)
      </text>

      {data.map((d, i) => {
        const y = topPad + i * barGap;
        const barW = (d.tonnage_t / maxTonnage) * barAreaW;

        return (
          <g key={d.depth_m}>
            {/* Depth label */}
            <text x={barAreaX - 12} y={y + barH / 2 + 4} textAnchor="end" fontSize={11} fill="#475569" fontWeight={600}>
              {d.depth_m.toFixed(2).replace(".", ",")}m
            </text>

            {/* Bar background */}
            <rect
              x={barAreaX}
              y={y}
              width={barAreaW}
              height={barH}
              rx={6}
              fill="#f1f5f9"
            />

            {/* Bar fill */}
            <rect
              x={barAreaX}
              y={y}
              width={Math.max(barW, 4)}
              height={barH}
              rx={6}
              fill={barColor(i)}
            />

            {/* Tonnage label on bar */}
            <text
              x={barAreaX + Math.max(barW, 4) + 6}
              y={y + barH / 2 + 4}
              fontSize={10}
              fill="#334155"
              fontWeight={600}
            >
              {d.tonnage_t.toLocaleString("nl-NL")}t
            </text>

            {/* Water depth indicator */}
            <g transform={`translate(${barAreaX - 46}, ${y + barH / 2})`}>
              <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                <path d="M1 8 Q3 5 6 8 Q9 11 11 8" stroke="#67e8f9" strokeWidth={1.2} fill="none" />
                <path d="M1 5 Q3 2 6 5 Q9 8 11 5" stroke="#a5f3fc" strokeWidth={1} fill="none" />
              </svg>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

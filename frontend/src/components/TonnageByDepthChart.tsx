"use client";

import React from "react";
import type { TonnageByDepth } from "@/lib/rawDetails";

interface TonnageByDepthChartProps {
  data: TonnageByDepth[];
}

export default function TonnageByDepthChart({ data }: TonnageByDepthChartProps) {
  if (data.length === 0) return null;

  const W = 360;
  const H = 200;
  const pad = { top: 24, right: 20, bottom: 36, left: 52 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const minDepth = Math.min(...data.map((d) => d.depth_m));
  const maxDepth = Math.max(...data.map((d) => d.depth_m));
  const minTonnage = Math.min(...data.map((d) => d.tonnage_t));
  const maxTonnage = Math.max(...data.map((d) => d.tonnage_t));

  // Add some padding to ranges so points aren't on edges
  const depthRange = maxDepth - minDepth || 1;
  const tonnageRange = maxTonnage - minTonnage || 1;
  const dPad = depthRange * 0.08;
  const tPad = tonnageRange * 0.1;
  const d0 = minDepth - dPad;
  const d1 = maxDepth + dPad;
  const t0 = Math.max(0, minTonnage - tPad);
  const t1 = maxTonnage + tPad;

  function x(depth: number) {
    return pad.left + ((depth - d0) / (d1 - d0)) * plotW;
  }
  function y(tonnage: number) {
    return pad.top + plotH - ((tonnage - t0) / (t1 - t0)) * plotH;
  }

  // Build polyline points
  const sorted = [...data].sort((a, b) => a.depth_m - b.depth_m);
  const linePoints = sorted.map((d) => `${x(d.depth_m)},${y(d.tonnage_t)}`).join(" ");

  // Filled area under the line
  const areaPoints = [
    `${x(sorted[0].depth_m)},${y(t0)}`,
    ...sorted.map((d) => `${x(d.depth_m)},${y(d.tonnage_t)}`),
    `${x(sorted[sorted.length - 1].depth_m)},${y(t0)}`,
  ].join(" ");

  // Y-axis ticks (tonnage) — 4 nice ticks
  const yTicks: number[] = [];
  const step = niceStep(tonnageRange, 4);
  const yStart = Math.ceil(t0 / step) * step;
  for (let v = yStart; v <= t1; v += step) {
    yTicks.push(v);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible" style={{ maxWidth: 360 }}>
      {/* Grid lines */}
      {yTicks.map((t) => (
        <line key={t} x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="#f1f5f9" strokeWidth={1} />
      ))}

      {/* Filled area */}
      <polygon points={areaPoints} fill="url(#tonnageGrad)" />
      <defs>
        <linearGradient id="tonnageGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Line */}
      <polyline points={linePoints} fill="none" stroke="#0891b2" strokeWidth={2} strokeLinejoin="round" />

      {/* Data points */}
      {sorted.map((d) => (
        <g key={d.depth_m}>
          <circle cx={x(d.depth_m)} cy={y(d.tonnage_t)} r={4} fill="#fff" stroke="#0891b2" strokeWidth={2} />
          {/* Value label above point */}
          <text
            x={x(d.depth_m)}
            y={y(d.tonnage_t) - 10}
            textAnchor="middle"
            fontSize={9}
            fill="#334155"
            fontWeight={600}
          >
            {d.tonnage_t.toLocaleString("nl-NL")}t
          </text>
        </g>
      ))}

      {/* X-axis: depth labels */}
      {sorted.map((d) => (
        <text
          key={d.depth_m}
          x={x(d.depth_m)}
          y={H - pad.bottom + 16}
          textAnchor="middle"
          fontSize={10}
          fill="#64748b"
          fontWeight={500}
        >
          {d.depth_m.toFixed(2).replace(".", ",")}m
        </text>
      ))}

      {/* X-axis label */}
      <text x={pad.left + plotW / 2} y={H - 2} textAnchor="middle" fontSize={9} fill="#94a3b8">
        Diepgang (m)
      </text>

      {/* Y-axis tick labels */}
      {yTicks.map((t) => (
        <text key={t} x={pad.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize={9} fill="#94a3b8">
          {t.toLocaleString("nl-NL")}
        </text>
      ))}

      {/* Y-axis label */}
      <text
        x={12}
        y={pad.top + plotH / 2}
        textAnchor="middle"
        fontSize={9}
        fill="#94a3b8"
        transform={`rotate(-90, 12, ${pad.top + plotH / 2})`}
      >
        Tonnage (t)
      </text>

      {/* Axes */}
      <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + plotH} stroke="#e2e8f0" strokeWidth={1} />
      <line x1={pad.left} x2={W - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} stroke="#e2e8f0" strokeWidth={1} />
    </svg>
  );
}

/** Calculate a "nice" step size for axis ticks. */
function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let nice: number;
  if (norm <= 1.5) nice = 1;
  else if (norm <= 3.5) nice = 2;
  else if (norm <= 7.5) nice = 5;
  else nice = 10;
  return nice * mag;
}

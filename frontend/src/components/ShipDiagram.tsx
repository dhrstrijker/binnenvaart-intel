"use client";

import React, { useState } from "react";
import type { EngineInfo } from "@/lib/rawDetails";

interface ShipDiagramProps {
  engines: EngineInfo[];
}

function hoursColor(hours: number | null): string {
  if (hours === null) return "#94a3b8"; // slate-400
  if (hours < 5000) return "#10b981"; // emerald-500
  if (hours < 10000) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
}

function hoursLabel(hours: number | null): string {
  if (hours === null) return "";
  return `${hours.toLocaleString("nl-NL")} uur`;
}

function positionLabel(pos: EngineInfo["position"]): string {
  switch (pos) {
    case "main": return "Hoofdmotor";
    case "generator": return "Generator";
    case "thruster": return "Boegschroef";
    case "gearbox": return "Keerkoppeling";
  }
}

/** Position marker along the ship (0 = bow, 1 = stern) */
function positionY(pos: EngineInfo["position"]): number {
  switch (pos) {
    case "thruster": return 0.18;
    case "generator": return 0.48;
    case "gearbox": return 0.72;
    case "main": return 0.82;
  }
}

export default function ShipDiagram({ engines }: ShipDiagramProps) {
  const [active, setActive] = useState<number | null>(null);

  if (engines.length === 0) return null;

  const W = 280;
  const H = 400;
  const shipW = 80;
  const shipX = 60;
  const markerX = shipX + shipW + 30;

  // Ship outline (top-down, bow at top)
  const shipPath = [
    `M ${shipX + shipW / 2} 30`,                   // bow tip
    `Q ${shipX + shipW} 60 ${shipX + shipW} 90`,   // right bow curve
    `L ${shipX + shipW} 340`,                       // right hull
    `Q ${shipX + shipW} 365 ${shipX + shipW / 2} 370`, // right stern curve
    `Q ${shipX} 365 ${shipX} 340`,                  // left stern curve
    `L ${shipX} 90`,                                // left hull
    `Q ${shipX} 60 ${shipX + shipW / 2} 30`,       // left bow curve
    "Z",
  ].join(" ");

  // Wheelhouse
  const whX = shipX + 12;
  const whY = 310;
  const whW = shipW - 24;
  const whH = 36;

  // Group engines by position, then spread if multiple at same position
  const positioned = engines.map((e, i) => {
    const baseY = 30 + positionY(e.position) * 340;
    return { engine: e, idx: i, y: baseY };
  });

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="max-w-[280px] mx-auto"
        style={{ height: "auto" }}
      >
        {/* Water pattern */}
        <defs>
          <pattern id="ship-water" width="20" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 5 Q5 0 10 5 Q15 10 20 5" fill="none" stroke="#e0f2fe" strokeWidth={1} />
          </pattern>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#ship-water)" rx="12" opacity="0.5" />

        {/* Ship hull */}
        <path
          d={shipPath}
          fill="#f0fdfa"
          stroke="#0891b2"
          strokeWidth={2}
        />

        {/* Center line */}
        <line
          x1={shipX + shipW / 2}
          y1={50}
          x2={shipX + shipW / 2}
          y2={350}
          stroke="#0891b2"
          strokeWidth={0.5}
          strokeDasharray="4,4"
          opacity={0.4}
        />

        {/* Wheelhouse */}
        <rect
          x={whX}
          y={whY}
          width={whW}
          height={whH}
          rx={4}
          fill="#ecfeff"
          stroke="#0891b2"
          strokeWidth={1.5}
        />
        <text x={shipX + shipW / 2} y={whY + whH / 2 + 3} textAnchor="middle" fontSize={8} fill="#0e7490" fontWeight={600}>
          STUURHUT
        </text>

        {/* Cargo hold area */}
        <rect
          x={shipX + 8}
          y={100}
          width={shipW - 16}
          height={190}
          rx={4}
          fill="#ecfeff"
          stroke="#0891b2"
          strokeWidth={0.5}
          strokeDasharray="3,3"
          opacity={0.6}
        />
        <text x={shipX + shipW / 2} y={198} textAnchor="middle" fontSize={7} fill="#67e8f9" fontWeight={500}>
          LAADRUIM
        </text>

        {/* Engine markers */}
        {positioned.map(({ engine, idx, y }) => {
          const isActive = active === idx;
          const color = hoursColor(engine.hours);

          return (
            <g
              key={idx}
              onMouseEnter={() => setActive(idx)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(isActive ? null : idx)}
              className="cursor-pointer"
            >
              {/* Connection line from ship to marker */}
              <line
                x1={shipX + shipW}
                y1={y}
                x2={markerX - 8}
                y2={y}
                stroke={color}
                strokeWidth={isActive ? 2 : 1}
                strokeDasharray={isActive ? undefined : "2,2"}
                opacity={isActive ? 1 : 0.5}
              />

              {/* Dot on ship */}
              <circle
                cx={shipX + shipW - 6}
                cy={y}
                r={isActive ? 5 : 4}
                fill={color}
                stroke="white"
                strokeWidth={2}
                className="transition-all duration-150"
              />

              {/* Marker label */}
              <g transform={`translate(${markerX}, ${y})`}>
                <rect
                  x={0}
                  y={-16}
                  width={130}
                  height={isActive ? 52 : 32}
                  rx={6}
                  fill={isActive ? "#f8fafc" : "white"}
                  stroke={isActive ? color : "#e2e8f0"}
                  strokeWidth={isActive ? 1.5 : 1}
                  className="transition-all duration-150"
                />

                {/* Position label */}
                <text x={8} y={-2} fontSize={8} fill="#94a3b8" fontWeight={500}>
                  {positionLabel(engine.position)}
                </text>

                {/* Engine name */}
                <text x={8} y={10} fontSize={9} fill="#1e293b" fontWeight={600}>
                  {(engine.name ?? "Onbekend").slice(0, 20)}
                </text>

                {/* Expanded details */}
                {isActive && (
                  <>
                    {engine.hp && (
                      <text x={8} y={24} fontSize={8} fill="#475569">
                        {engine.hp} pk
                        {engine.year ? ` (${engine.year})` : ""}
                      </text>
                    )}
                    {engine.hours !== null && (
                      <text x={8} y={34} fontSize={8} fill={color} fontWeight={500}>
                        {hoursLabel(engine.hours)}
                      </text>
                    )}
                  </>
                )}
              </g>
            </g>
          );
        })}

        {/* Bow label */}
        <text x={shipX + shipW / 2} y={20} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={500}>
          BOEG
        </text>

        {/* Stern label */}
        <text x={shipX + shipW / 2} y={390} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={500}>
          HECHT
        </text>
      </svg>

      {/* Hours legend */}
      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          &lt;5.000u
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          5.000-10.000u
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          &gt;10.000u
        </span>
      </div>
    </div>
  );
}

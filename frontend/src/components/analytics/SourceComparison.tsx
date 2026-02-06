"use client";

import { Vessel, PriceHistory } from "@/lib/supabase";

interface PricePressureProps {
  vessels: Vessel[];
  priceHistory: PriceHistory[];
}

export default function PricePressure({ vessels, priceHistory }: PricePressureProps) {
  // 1. Build vessel_id → PriceHistory[] map
  const historyByVessel = new Map<string, PriceHistory[]>();
  for (const ph of priceHistory) {
    const arr = historyByVessel.get(ph.vessel_id) ?? [];
    arr.push(ph);
    historyByVessel.set(ph.vessel_id, arr);
  }

  // 2. For vessels with 2+ records: compare first → latest price
  let dropCount = 0;
  let increaseCount = 0;
  let unchangedCount = 0;
  let dropPctSum = 0;
  let increasePctSum = 0;

  const vesselMap = new Map(vessels.map((v) => [v.id, v]));

  for (const [vesselId, records] of historyByVessel.entries()) {
    if (records.length < 2) continue;
    if (!vesselMap.has(vesselId)) continue;

    // Already sorted by recorded_at ascending from the query
    const firstPrice = records[0].price;
    const latestPrice = records[records.length - 1].price;

    if (firstPrice <= 0) continue;

    const changePct = ((latestPrice - firstPrice) / firstPrice) * 100;

    if (changePct < -1) {
      dropCount++;
      dropPctSum += changePct;
    } else if (changePct > 1) {
      increaseCount++;
      increasePctSum += changePct;
    } else {
      unchangedCount++;
    }
  }

  const totalWithChanges = dropCount + increaseCount + unchangedCount;

  // Empty state
  if (totalWithChanges === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Prijsdruk</h2>
        <p className="text-sm text-slate-400">
          Nog geen prijswijzigingen geregistreerd. Prijsdruk wordt zichtbaar
          zodra de scraper prijsveranderingen detecteert.
        </p>
      </div>
    );
  }

  const avgDropPct = dropCount > 0 ? dropPctSum / dropCount : 0;
  const avgIncreasePct = increaseCount > 0 ? increasePctSum / increaseCount : 0;

  // Stacked bar segments
  const segments = [
    { count: dropCount, color: "bg-red-500", pct: (dropCount / totalWithChanges) * 100 },
    { count: unchangedCount, color: "bg-slate-300", pct: (unchangedCount / totalWithChanges) * 100 },
    { count: increaseCount, color: "bg-emerald-500", pct: (increaseCount / totalWithChanges) * 100 },
  ];

  return (
    <div className="rounded-xl bg-white p-5 shadow-md ring-1 ring-gray-100">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Prijsdruk</h2>
      <p className="mb-4 text-xs text-slate-400">
        Prijsbewegingen sinds eerste registratie
      </p>

      {/* 3 summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Drop */}
        <div className="rounded-lg bg-red-50 p-3 text-center ring-1 ring-red-100">
          <p className="text-2xl font-bold text-red-700">{dropCount}</p>
          <p className="text-xs font-medium text-red-600">Prijsdaling</p>
          {dropCount > 0 && (
            <p className="mt-0.5 text-xs text-red-500">
              gem. {avgDropPct.toFixed(1)}%
            </p>
          )}
        </div>

        {/* Unchanged */}
        <div className="rounded-lg bg-slate-50 p-3 text-center ring-1 ring-slate-200">
          <p className="text-2xl font-bold text-slate-700">{unchangedCount}</p>
          <p className="text-xs font-medium text-slate-600">Ongewijzigd</p>
          <p className="mt-0.5 text-xs text-slate-400">&plusmn;1%</p>
        </div>

        {/* Increase */}
        <div className="rounded-lg bg-emerald-50 p-3 text-center ring-1 ring-emerald-100">
          <p className="text-2xl font-bold text-emerald-700">{increaseCount}</p>
          <p className="text-xs font-medium text-emerald-600">Prijsstijging</p>
          {increaseCount > 0 && (
            <p className="mt-0.5 text-xs text-emerald-500">
              gem. +{avgIncreasePct.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {/* Stacked horizontal bar */}
      <div className="flex h-4 overflow-hidden rounded-full">
        {segments.map((seg, i) =>
          seg.count > 0 ? (
            <div
              key={i}
              className={`${seg.color} transition-all`}
              style={{ width: `${seg.pct}%` }}
            />
          ) : null
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
        <span>Daling ({dropCount})</span>
        <span>Ongewijzigd ({unchangedCount})</span>
        <span>Stijging ({increaseCount})</span>
      </div>
    </div>
  );
}

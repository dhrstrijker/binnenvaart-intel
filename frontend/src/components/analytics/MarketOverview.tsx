"use client";

import { Vessel } from "@/lib/supabase";

function formatEur(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

interface MarketOverviewProps {
  vessels: Vessel[];
}

export default function MarketOverview({ vessels }: MarketOverviewProps) {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const totalVessels = vessels.length;

  // New listings this month (based on first_seen_at)
  const newThisMonth = vessels.filter((v) => {
    const d = new Date(v.first_seen_at);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;

  // Median days on market
  const daysOnMarket = vessels
    .map((v) =>
      Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(v.first_seen_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    )
    .sort((a, b) => a - b);
  const medianDays = median(daysOnMarket);

  // Median price per meter
  const ppmValues = vessels
    .filter((v) => v.price && v.price > 0 && v.length_m && v.length_m > 0)
    .map((v) => v.price! / v.length_m!)
    .sort((a, b) => a - b);
  const medianPpm = median(ppmValues);

  const stats = [
    {
      label: "Te koop",
      value: String(totalVessels),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
        </svg>
      ),
    },
    {
      label: "Nieuw deze maand",
      value: String(newThisMonth),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
    },
    {
      label: "Mediaan op markt",
      value: medianDays > 0 ? `${Math.round(medianDays)} dagen` : "-",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "Mediaan prijs/m",
      value: medianPpm > 0 ? `${formatEur(Math.round(medianPpm))}/m` : "-",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-slate-900">Marktoverzicht</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-white p-4 shadow-md ring-1 ring-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                {stat.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {stat.label}
                </p>
                <p className="truncate text-lg font-bold text-slate-900">
                  {stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

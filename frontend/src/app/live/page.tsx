"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/formatting";
import { sourceLabel } from "@/lib/sources";
import { useSubscription } from "@/lib/useSubscription";
import type { ActivityLogEntry } from "@/lib/supabase";

const DAYS_WINDOW = 14;

const FAKE_ROWS = [
  "Prijswijziging € 950.000 -> € 910.000 · Galle Makelaars",
  "Nieuw schip toegevoegd · GSK Brokers",
  "Verwijderd uit aanbod · P.C. Shipbrokers",
  "Prijswijziging € 680.000 -> € 725.000 · Rensen-Driessen",
  "Verkocht · GTS Schepen",
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Zojuist";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  return `${days} dag${days === 1 ? "" : "en"} geleden`;
}

function eventLabel(type: string): string {
  switch (type) {
    case "inserted":
      return "Nieuw";
    case "price_changed":
      return "Prijswijziging";
    case "removed":
      return "Verwijderd";
    case "sold":
      return "Verkocht";
    default:
      return type;
  }
}

function eventIcon(entry: ActivityLogEntry) {
  switch (entry.event_type) {
    case "inserted":
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </span>
      );
    case "price_changed":
      if (entry.old_price != null && entry.new_price != null) {
        if (entry.new_price > entry.old_price) {
          return (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </span>
          );
        }
        if (entry.new_price < entry.old_price) {
          return (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </span>
          );
        }
      }
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </span>
      );
    case "removed":
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </span>
      );
    case "sold":
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      );
    default:
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <span className="h-2.5 w-2.5 rounded-full bg-current" />
        </span>
      );
  }
}

export default function LivePage() {
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subLoading) return;

    let cancelled = false;

    async function fetchEntries() {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const since = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(500);

      if (cancelled) return;

      if (error) {
        setEntries([]);
        setError("Kon live wijzigingen niet laden.");
      } else {
        setEntries(data ?? []);
      }
      setLoading(false);
    }

    fetchEntries();

    return () => {
      cancelled = true;
    };
  }, [subLoading, user?.id]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Live wijzigingen</h1>
              <p className="mt-1 text-sm text-slate-500">
                Alle wijzigingen van de afgelopen 2 weken.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {entries.length} zichtbaar
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
            </div>
          ) : error ? (
            <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : entries.length === 0 ? (
            <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Geen wijzigingen gevonden in de afgelopen 2 weken.
            </p>
          ) : (
            <div className="mt-5 space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 px-4 py-3"
                >
                  {eventIcon(entry)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-base font-semibold text-slate-900">{entry.vessel_name}</p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {relativeTime(entry.recorded_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {eventLabel(entry.event_type)}
                      {entry.event_type === "price_changed" &&
                        entry.old_price != null &&
                        entry.new_price != null && (
                          <>
                            {" "}
                            <span className="text-slate-400">{formatPrice(entry.old_price)}</span>
                            {" "}
                            <span className="text-slate-400">&rarr;</span>
                            {" "}
                            <span className="font-medium text-slate-700">{formatPrice(entry.new_price)}</span>
                          </>
                        )}
                      {entry.vessel_source && (
                        <span className="text-slate-400">
                          {" "}
                          &middot; {sourceLabel(entry.vessel_source)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isPremium && (
            <div className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="space-y-2 p-4" aria-hidden="true">
                {FAKE_ROWS.map((line, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-500">
                    {line}
                  </div>
                ))}
              </div>

              <div className="pointer-events-none absolute inset-0 bg-white/65 backdrop-blur-[4px]" />

              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl bg-slate-950/90 p-5 text-center text-white shadow-xl">
                <p className="text-sm font-semibold">
                  Historische wijzigingen ouder dan de 3 meest recente zijn alleen zichtbaar met Pro.
                </p>
                <p className="mt-1 text-xs text-slate-200">
                  Upgrade voor volledige toegang tot 2 weken historie.
                </p>
                <Link
                  href="/pricing"
                  className="pointer-events-auto mt-3 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-400"
                >
                  Upgrade naar Navisio Pro
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

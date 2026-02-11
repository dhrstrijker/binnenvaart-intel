"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/formatting";
import { sourceLabel } from "@/lib/sources";
import { useSubscription } from "@/lib/useSubscription";
import type { ActivityLogEntry } from "@/lib/supabase";

const DAYS_WINDOW = 14;

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
  const router = useRouter();
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subLoading) return;
    if (!user) {
      router.replace("/login?next=%2Flive");
      return;
    }
    if (!isPremium) {
      router.replace("/pricing");
    }
  }, [subLoading, user, isPremium, router]);

  useEffect(() => {
    if (subLoading || !user || !isPremium) return;

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
  }, [subLoading, user, isPremium]);

  if (subLoading || !user || !isPremium) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

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

        </div>
      </main>
      <Footer />
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useActivityLog } from "@/lib/useActivityLog";
import { useOutsideClick } from "@/lib/useOutsideClick";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { formatPrice } from "@/lib/formatting";
import { sourceLabel } from "@/lib/sources";

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

function eventIcon(type: string) {
  switch (type) {
    case "inserted":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </span>
      );
    case "price_changed":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 17l9.2-9.2M17 17V7H7" />
          </svg>
        </span>
      );
    case "removed":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-red-500">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </span>
      );
    case "sold":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      );
    default:
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <span className="h-2 w-2 rounded-full bg-current" />
        </span>
      );
  }
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

export default function LiveDropdown() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { entries, loading } = useActivityLog(3);

  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(dropdownRef, close, open);
  useEscapeKey(close);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger: Live badge */}
      <button
        onClick={() => setOpen(!open)}
        className="hidden cursor-pointer items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 transition hover:bg-white/15 sm:flex"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-medium text-cyan-100">Live</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl bg-white shadow-xl ring-1 ring-gray-100">
          <div className="p-4 pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Laatste wijzigingen
            </h3>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
            </div>
          ) : entries.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-slate-400">
              Geen recente wijzigingen.
            </p>
          ) : (
            <div className="space-y-1 px-2 pb-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                >
                  {eventIcon(entry.event_type)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {entry.vessel_name}
                      </p>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {relativeTime(entry.recorded_at)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {eventLabel(entry.event_type)}
                      {entry.event_type === "price_changed" &&
                        entry.old_price != null &&
                        entry.new_price != null && (
                          <>
                            {" "}
                            <span className="text-slate-400">
                              {formatPrice(entry.old_price)}
                            </span>
                            {" "}
                            <span className="text-slate-400">&rarr;</span>
                            {" "}
                            <span className="font-medium text-slate-700">
                              {formatPrice(entry.new_price)}
                            </span>
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

          {/* Pro upsell */}
          <div className="border-t border-slate-100 p-4">
            <p className="text-center text-xs text-slate-500">
              Wil je meer marktdata en realtime meldingen?{" "}
              <Link
                href="/pricing"
                onClick={close}
                className="font-semibold text-cyan-600 hover:text-cyan-700"
              >
                Upgrade naar Navisio Pro
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

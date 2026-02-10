"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOutsideClick } from "@/lib/useOutsideClick";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useAuthModal } from "@/lib/AuthModalContext";
import { useSavedSearches } from "@/lib/useSavedSearches";
import { useWatchlistCount } from "@/lib/WatchlistContext";
import { getFilterPills, generateSearchName } from "@/lib/savedSearchTypes";
import { formatPrice } from "@/lib/formatting";
import { sourceLabel } from "@/lib/sources";
import type { User } from "@supabase/supabase-js";

interface WatchlistVessel {
  id: string;
  vessel_id: string;
  vessels: {
    id: string;
    name: string;
    source: string;
    price: number | null;
  };
}

interface NotificationsDropdownProps {
  user: User | null;
  isPremium: boolean;
}

export default function NotificationsDropdown({ user, isPremium }: NotificationsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistVessel[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { openAuthModal } = useAuthModal();

  const { searches, loading: searchesLoading, activeCount, deleteSearch, toggleActive, canAddSearch, refresh: refreshSearches } = useSavedSearches(user, isPremium);
  const { watchlistCount, setWatchlistCount } = useWatchlistCount();

  const totalCount = activeCount + watchlistCount;

  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(dropdownRef, close, open);
  useEscapeKey(close);

  // Fetch data when dropdown opens
  useEffect(() => {
    if (!open || !user) return;

    refreshSearches();

    setWatchlistLoading(true);
    const supabase = createClient();
    supabase
      .from("watchlist")
      .select("id, vessel_id, vessels(id, name, source, price)")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false })
      .then(({ data }) => {
        const items = (data as unknown as WatchlistVessel[]) ?? [];
        setWatchlistItems(items);
        setWatchlistCount(items.length);
        setWatchlistLoading(false);
      });
  }, [open, user, refreshSearches]);

  async function handleRemoveWatchlist(watchlistId: string) {
    const supabase = createClient();
    await supabase.from("watchlist").delete().eq("id", watchlistId);
    setWatchlistItems((prev) => {
      const next = prev.filter((w) => w.id !== watchlistId);
      setWatchlistCount(next.length);
      return next;
    });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-cyan-200 transition hover:bg-white/10 hover:text-white"
        aria-label="Meldingen"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {user && totalCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-white">
            {totalCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl bg-white shadow-xl ring-1 ring-gray-100">
          {!user ? (
            /* Not logged in */
            <div className="p-5 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50">
                <svg className="h-5 w-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">Log in om meldingen te ontvangen</p>
              <p className="mt-1 text-xs text-slate-400">Bewaar zoekopdrachten en volg schepen.</p>
              <button
                onClick={() => { setOpen(false); openAuthModal(); }}
                className="mt-3 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                Inloggen
              </button>
            </div>
          ) : (
            /* Logged in */
            <div className="max-h-[28rem] overflow-y-auto">
              {/* Section 1: Zoekopdrachten */}
              <div className="p-4 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Zoekopdrachten
                </h3>
              </div>

              {searchesLoading ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
                </div>
              ) : searches.length === 0 ? (
                <p className="px-4 pb-3 text-xs text-slate-400">
                  Geen zoekopdrachten. Stel filters in op het dashboard en klik op &lsquo;Zoekopdracht opslaan&rsquo;.
                </p>
              ) : (
                <div className="space-y-1 px-2 pb-2">
                  {searches.map((search) => {
                    const pills = getFilterPills(search.filters);
                    const displayName = search.name ?? generateSearchName(search.filters);
                    const visiblePills = pills.slice(0, 3);
                    const overflow = pills.length - 3;

                    return (
                      <div
                        key={search.id}
                        className={`group rounded-xl px-3 py-2.5 transition hover:bg-slate-50 ${!search.active ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium text-slate-800">
                            {displayName}
                          </p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {/* Toggle */}
                            <button
                              onClick={() => toggleActive(search.id, !search.active)}
                              className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
                                search.active ? "bg-cyan-500" : "bg-slate-300"
                              }`}
                              role="switch"
                              aria-checked={search.active}
                              title={search.active ? "Pauzeren" : "Activeren"}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                                  search.active ? "translate-x-3" : "translate-x-0.5"
                                } mt-0.5`}
                              />
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => deleteSearch(search.id)}
                              className="rounded p-0.5 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                              title="Verwijderen"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {visiblePills.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {visiblePills.map((pill, i) => (
                              <span key={i} className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
                                {pill.label}
                              </span>
                            ))}
                            {overflow > 0 && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                +{overflow}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!canAddSearch && (
                <div className="mx-4 mb-3 rounded-lg border border-dashed border-slate-200 p-3 text-center">
                  <p className="text-xs text-slate-500">
                    Max {2} zoekopdrachten bereikt.{" "}
                    <Link href="/pricing" onClick={() => setOpen(false)} className="font-semibold text-cyan-600 hover:text-cyan-700">
                      Upgrade naar Pro
                    </Link>
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="mx-4 border-t border-slate-100" />

              {/* Section 2: Volglijst */}
              <div className="p-4 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Volglijst
                </h3>
              </div>

              {watchlistLoading ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
                </div>
              ) : watchlistItems.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-slate-400">
                  Geen schepen op je volglijst.
                </p>
              ) : (
                <div className="space-y-1 px-2 pb-3">
                  {watchlistItems.map((item) => (
                    <div key={item.id} className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {item.vessels.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {sourceLabel(item.vessels.source)}
                          {item.vessels.price !== null && ` · ${formatPrice(item.vessels.price)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveWatchlist(item.id)}
                        className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                        title="Verwijderen"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

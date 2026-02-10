"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useOutsideClick } from "@/lib/useOutsideClick";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useAuthModal } from "@/lib/AuthModalContext";
import { useLocalFavorites } from "@/lib/useLocalFavorites";
import { useFavoritesCount } from "@/lib/FavoritesCountContext";
import { formatPrice } from "@/lib/formatting";
import { sourceLabel } from "@/lib/sources";
import type { User } from "@supabase/supabase-js";

interface FavoriteVessel {
  id: string;
  name: string;
  source: string;
  price: number | null;
  image_url: string | null;
}

interface FavoritesDropdownProps {
  user: User | null;
}

export default function FavoritesDropdown({ user }: FavoritesDropdownProps) {
  const [open, setOpen] = useState(false);
  const [vessels, setVessels] = useState<FavoriteVessel[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { openAuthModal } = useAuthModal();
  const { localFavorites } = useLocalFavorites();
  const { favoritesCount } = useFavoritesCount();

  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(dropdownRef, close, open);
  useEscapeKey(close);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    const supabase = createClient();

    if (user) {
      supabase
        .from("favorites")
        .select("vessel_id, vessels(id, name, source, price, image_url)")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false })
        .limit(4)
        .then(({ data }) => {
          const items = (data ?? []) as unknown as { vessel_id: string; vessels: FavoriteVessel }[];
          setVessels(items.map((r) => r.vessels));
          setLoading(false);
        });
    } else if (localFavorites.length > 0) {
      supabase
        .from("vessels")
        .select("id, name, source, price, image_url")
        .in("id", localFavorites.slice(0, 4))
        .then(({ data }) => {
          setVessels((data as FavoriteVessel[]) ?? []);
          setLoading(false);
        });
    } else {
      setVessels([]);
      setLoading(false);
    }
  }, [open, user, localFavorites]);

  const preview = vessels.slice(0, 3);
  const hasMore = favoritesCount > 3;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-cyan-200 transition hover:bg-white/10 hover:text-white"
        aria-label="Favorieten"
      >
        <svg className="h-5 w-5 fav-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
        <svg className="h-5 w-5 fav-filled hidden" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
        </svg>
        {favoritesCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {favoritesCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl bg-white shadow-xl ring-1 ring-gray-100">
          {!user && localFavorites.length === 0 ? (
            <div className="p-5 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">Sla je favoriete schepen op</p>
              <p className="mt-1 text-xs text-slate-400">Klik op het hartje bij een schip om het te bewaren.</p>
              <button
                onClick={() => { close(); openAuthModal(); }}
                className="mt-3 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                Inloggen
              </button>
            </div>
          ) : (
            <>
              <div className="p-4 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Favorieten
                </h3>
              </div>

              {loading ? (
                <div className="flex justify-center py-6">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
                </div>
              ) : preview.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-slate-400">
                  Nog geen favorieten.
                </p>
              ) : (
                <div className="space-y-1 px-2 pb-2">
                  {preview.map((v) => (
                    <Link
                      key={v.id}
                      href={`/schepen/${v.id}`}
                      onClick={close}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {v.image_url ? (
                          <Image
                            src={v.image_url}
                            alt={v.name}
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-300">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{v.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {sourceLabel(v.source)}
                          {v.price !== null && ` · ${formatPrice(v.price)}`}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Link to full page */}
              <div className="border-t border-slate-100 p-3">
                <Link
                  href="/favorieten"
                  onClick={close}
                  className="block rounded-xl py-2 text-center text-sm font-semibold text-cyan-600 transition hover:bg-cyan-50"
                >
                  {hasMore
                    ? `Bekijk alle ${favoritesCount} favorieten`
                    : "Bekijk favorieten"}
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Vessel, PriceHistory } from "@/lib/supabase";
import { sourceLabel, sourceColor } from "@/lib/sources";
import { MiniSparkline } from "./PriceHistoryChart";
import FavoriteButton from "./FavoriteButton";
import type { User } from "@supabase/supabase-js";

function formatPrice(price: number | null): string {
  if (price === null) return "Prijs op aanvraag";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function isNew(firstSeenAt: string): boolean {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return new Date(firstSeenAt) > sevenDaysAgo;
}

type PriceTrend = "down" | "up" | "unchanged" | null;

function getPriceTrend(history: PriceHistory[]): PriceTrend {
  if (history.length < 2) return null;
  const first = history[0].price;
  const last = history[history.length - 1].price;
  if (last < first) return "down";
  if (last > first) return "up";
  return "unchanged";
}

interface VesselCardProps {
  vessel: Vessel;
  priceHistory?: PriceHistory[];
  isPremium?: boolean;
  user?: User | null;
}

export default function VesselCard({ vessel, priceHistory = [], isPremium = false, user = null }: VesselCardProps) {
  const [imgError, setImgError] = React.useState(false);
  const trend = getPriceTrend(priceHistory);

  return (
    <Link
      href={`/schepen/${vessel.id}`}
      className={`group block overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-gray-100 transition-all duration-200 hover:shadow-xl hover:ring-cyan-200 hover:-translate-y-0.5 cursor-pointer${vessel.status === "removed" || vessel.status === "sold" ? " opacity-60" : ""}`}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] w-full bg-slate-100 overflow-hidden">
        {vessel.image_url && !imgError ? (
          <Image
            src={vessel.image_url}
            alt={vessel.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              className="h-16 w-16 text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"
              />
            </svg>
          </div>
        )}

        {/* Badges overlay */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {vessel.status === "sold" && (
            <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
              VERKOCHT
            </span>
          )}
          {vessel.status === "removed" && (
            <span className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
              NIET MEER BESCHIKBAAR
            </span>
          )}
          {vessel.status !== "removed" && vessel.status !== "sold" && isNew(vessel.first_seen_at) && (
            <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
              NIEUW
            </span>
          )}
          {vessel.type && (
            <span className="rounded-md bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm">
              {vessel.type}
            </span>
          )}
        </div>

        {/* Source badge */}
        <div className="absolute top-2.5 right-2.5">
          {vessel.linked_sources && vessel.linked_sources.length >= 2 ? (
            <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800 shadow-sm">
              {vessel.linked_sources.length} bronnen
            </span>
          ) : (
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold shadow-sm ${sourceColor(vessel.source)}`}
            >
              {sourceLabel(vessel.source)}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h2 className="truncate text-lg font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">
          {vessel.name}
        </h2>

        {/* Specs row */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          {vessel.length_m && vessel.width_m && (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
              {vessel.length_m} x {vessel.width_m} m
            </span>
          )}
          {vessel.build_year && (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {vessel.build_year}
            </span>
          )}
          {vessel.tonnage && (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              {vessel.tonnage}t
            </span>
          )}
        </div>

        {/* Price + trend indicator */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-slate-900">
              {formatPrice(vessel.price)}
            </span>
            {isPremium && trend === "down" && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600" title="Prijs gedaald">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </span>
            )}
            {isPremium && trend === "up" && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500" title="Prijs gestegen">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </span>
            )}
            {isPremium && trend === "unchanged" && (
              <span className="flex items-center text-xs font-semibold text-slate-400" title="Prijs ongewijzigd">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                </svg>
              </span>
            )}
            {isPremium && <MiniSparkline history={priceHistory} />}
          </div>
          <div className="flex items-center gap-1">
            <FavoriteButton vesselId={vessel.id} user={user} />
            {!user && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.location.href = "/signup";
                }}
                className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="Maak een account voor prijsmeldingen"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                Prijsmelding
              </button>
            )}
            <span className="flex items-center gap-1 text-xs font-medium text-cyan-600 opacity-0 transition-opacity group-hover:opacity-100">
              Details
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

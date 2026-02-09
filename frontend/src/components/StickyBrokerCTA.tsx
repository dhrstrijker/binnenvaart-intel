"use client";

import React, { useState, useEffect } from "react";
import { Vessel } from "@/lib/supabase";
import { sourceLabel, sourceColor, safeUrl } from "@/lib/sources";

interface StickyBrokerCTAProps {
  vessel: Vessel;
}

export default function StickyBrokerCTA({ vessel }: StickyBrokerCTAProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Entrance animation
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, []);

  const multiSource = vessel.linked_sources && vessel.linked_sources.length >= 2;

  return (
    <>
      {/* Desktop: card in sidebar (sticky handled by parent) */}
      <div
        className={`hidden lg:block transition-all duration-300 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          {/* Broker badge */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${sourceColor(vessel.source)}`}
            >
              {sourceLabel(vessel.source)}
            </span>
            {multiSource && (
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                +{vessel.linked_sources!.length - 1}
              </span>
            )}
          </div>

          {/* Primary CTA */}
          <a
            href={safeUrl(vessel.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-cyan-600/20 transition-all hover:bg-cyan-700 hover:shadow-lg hover:shadow-cyan-600/30 active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Bekijk bij {sourceLabel(vessel.source)}
          </a>

          {/* Secondary sources */}
          {multiSource && (
            <div className="mt-3 space-y-2">
              {vessel.linked_sources!
                .filter((ls) => ls.source !== vessel.source)
                .map((ls) => (
                  <a
                    key={ls.vessel_id}
                    href={safeUrl(ls.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${sourceColor(ls.source)}`}
                    >
                      {sourceLabel(ls.source)}
                    </span>
                    <span className="flex-1">Bekijk listing</span>
                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
            </div>
          )}

        </div>
      </div>

      {/* Mobile: fixed bottom bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-transform duration-300 ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            {/* Broker badge */}
            <span
              className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${sourceColor(vessel.source)}`}
            >
              {sourceLabel(vessel.source)}
            </span>

            {/* CTA button */}
            <a
              href={safeUrl(vessel.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-cyan-600/20 transition hover:bg-cyan-700 active:scale-[0.98]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Contact makelaar
            </a>

          </div>
        </div>
      </div>
    </>
  );
}

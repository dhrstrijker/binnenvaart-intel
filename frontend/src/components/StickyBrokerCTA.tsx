"use client";

import React, { useState, useEffect, useRef } from "react";
import { Vessel } from "@/lib/supabase";
import { sourceLabel, sourceColor, safeUrl, sourcePhone, sourceEmail, formatPhoneDisplay } from "@/lib/sources";

interface StickyBrokerCTAProps {
  vessel: Vessel;
}

interface BrokerEntry {
  source: string;
  url: string;
}

function getBrokers(vessel: Vessel): BrokerEntry[] {
  if (vessel.linked_sources && vessel.linked_sources.length >= 2) {
    // Alphabetical by label for impartiality
    return [...vessel.linked_sources]
      .map((ls) => ({ source: ls.source, url: ls.url }))
      .sort((a, b) => sourceLabel(a.source).localeCompare(sourceLabel(b.source)));
  }
  return [{ source: vessel.source, url: vessel.url }];
}

function BrokerRow({ broker }: { broker: BrokerEntry }) {
  const phone = sourcePhone(broker.source);
  const email = sourceEmail(broker.source);

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      {/* Broker name + listing link */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${sourceColor(broker.source)}`}
        >
          {sourceLabel(broker.source)}
        </span>
        <a
          href={safeUrl(broker.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-cyan-600"
        >
          Listing
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Contact buttons */}
      <div className="mt-2 flex gap-2">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className="truncate">{formatPhoneDisplay(phone)}</span>
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="truncate">E-mail</span>
          </a>
        )}
      </div>
    </div>
  );
}

export default function StickyBrokerCTA({ vessel }: StickyBrokerCTAProps) {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, []);

  // Close sheet on outside tap
  useEffect(() => {
    if (!sheetOpen) return;
    function handleClick(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setSheetOpen(false);
      }
    }
    // Delay listener to avoid closing immediately from the button click
    const t = setTimeout(() => document.addEventListener("click", handleClick), 10);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClick);
    };
  }, [sheetOpen]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (sheetOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [sheetOpen]);

  const brokers = getBrokers(vessel);
  const brokerCount = brokers.length;

  return (
    <>
      {/* ── Desktop: sidebar card ── */}
      <div
        className={`hidden lg:block transition-all duration-300 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">
            Contact opnemen
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {brokerCount === 1
              ? "Aangeboden door 1 makelaar"
              : `Aangeboden door ${brokerCount} makelaars`}
          </p>

          <div className="mt-4 divide-y divide-slate-100">
            {brokers.map((b) => (
              <BrokerRow key={b.source} broker={b} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile: fixed bottom bar + bottom sheet ── */}

      {/* Backdrop */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-transform duration-300 ease-out ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.12)]">
          {/* Drag handle */}
          <div className="flex justify-center py-3">
            <div className="h-1 w-10 rounded-full bg-slate-300" />
          </div>

          {/* Header */}
          <div className="px-5 pb-2">
            <h3 className="text-base font-bold text-slate-900">Contact opnemen</h3>
            <p className="text-xs text-slate-400">
              {brokerCount === 1
                ? "Aangeboden door 1 makelaar"
                : `Aangeboden door ${brokerCount} makelaars`}
            </p>
          </div>

          {/* Broker list */}
          <div className="px-5 pb-5 divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {brokers.map((b) => (
              <BrokerRow key={b.source} broker={b} />
            ))}
          </div>
        </div>
      </div>

      {/* Fixed bottom bar trigger */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden transition-all duration-300 ${
          visible && !sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-lg">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-cyan-600/20 transition hover:bg-cyan-700 active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {brokerCount === 1
              ? `Contact ${sourceLabel(brokers[0].source)}`
              : `Contact (${brokerCount} makelaars)`}
          </button>
        </div>
      </div>
    </>
  );
}

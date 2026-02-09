"use client";

import React, { useState } from "react";
import { Vessel } from "@/lib/supabase";
import {
  extractTonnageByDepth,
  groupRawDetails,
} from "@/lib/rawDetails";
import TonnageByDepthChart from "./TonnageByDepthChart";
import StructuredSpecs from "./StructuredSpecs";

interface TechnicalSpecsProps {
  vessel: Vessel;
}

export default function TechnicalSpecs({ vessel }: TechnicalSpecsProps) {
  const raw = vessel.raw_details;
  const structured = vessel.structured_details;
  const tonnage = extractTonnageByDepth(raw);
  const groups = groupRawDetails(raw);
  const [expanded, setExpanded] = useState(false);

  const hasStructured = structured && Object.keys(structured).length > 0;
  const hasRaw = groups.length > 0;

  if (!hasStructured && tonnage.length === 0 && !hasRaw) return null;

  return (
    <div className="space-y-6">
      {/* Tonnage chart */}
      {tonnage.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Tonnage per diepgang</h3>
          <TonnageByDepthChart data={tonnage} />
        </div>
      )}

      {/* Structured specs (LLM-extracted) */}
      {hasStructured && <StructuredSpecs data={structured} />}

      {/* Raw details — collapsible */}
      {hasRaw && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">Alle scheepsgegevens</h3>
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {expanded && (
            <div className="border-t border-slate-100 px-5 pb-5 pt-3 space-y-5">
              {groups.map((group) => (
                <div key={group.section}>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    {group.section}
                  </h4>
                  <dl className="divide-y divide-slate-50">
                    {group.items.map((item, i) => {
                      const isLongText = item.value.length > 150 && item.value.includes("\n");
                      return isLongText ? (
                        <div key={i} className="py-2">
                          <dt className="text-sm text-slate-500 mb-1">{item.label}</dt>
                          <dd className="text-sm text-slate-800 whitespace-pre-line bg-slate-50 rounded-lg p-3">
                            {item.value}
                          </dd>
                        </div>
                      ) : (
                        <div key={i} className="flex justify-between gap-4 py-1.5">
                          <dt className="text-sm text-slate-500 min-w-0 shrink-0">{item.label}</dt>
                          <dd className="text-sm font-medium text-slate-800 text-right min-w-0 break-words max-w-[60%]">
                            {item.value}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

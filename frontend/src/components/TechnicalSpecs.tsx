"use client";

import React, { useState } from "react";
import { Vessel } from "@/lib/supabase";
import {
  extractEngines,
  extractTonnageByDepth,
  extractNavigation,
  extractCertificates,
  extractAccommodation,
  extractHolds,
  type EngineInfo,
  type NavigationEquipment,
  type Certificates,
  type Accommodation,
  type HoldInfo,
  type TonnageByDepth,
} from "@/lib/rawDetails";
import ShipDiagram from "./ShipDiagram";
import TonnageByDepthChart from "./TonnageByDepthChart";

interface TechnicalSpecsProps {
  vessel: Vessel;
}

type TabId = "propulsion" | "cargo" | "navigation" | "accommodation";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

export default function TechnicalSpecs({ vessel }: TechnicalSpecsProps) {
  const raw = vessel.raw_details;
  const engines = extractEngines(raw);
  const tonnage = extractTonnageByDepth(raw);
  const nav = extractNavigation(raw);
  const certs = extractCertificates(raw);
  const accommodation = extractAccommodation(raw);
  const holds = extractHolds(raw);

  // Build available tabs
  const tabs: Tab[] = [];

  if (engines.length > 0) {
    tabs.push({
      id: "propulsion",
      label: "Aandrijving",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
        </svg>
      ),
    });
  }

  if (tonnage.length > 0 || holds) {
    tabs.push({
      id: "cargo",
      label: "Laadcapaciteit",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      ),
    });
  }

  if (nav || certs) {
    tabs.push({
      id: "navigation",
      label: "Navigatie & Veiligheid",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
      ),
    });
  }

  if (accommodation) {
    tabs.push({
      id: "accommodation",
      label: "Accommodatie",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      ),
    });
  }

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0]?.id ?? "propulsion");

  if (tabs.length === 0) return null;

  // Ensure active tab is valid
  const currentTab = tabs.find((t) => t.id === activeTab) ? activeTab : tabs[0].id;

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-2.5 text-xs font-medium transition ${
              currentTab === tab.id
                ? "border-b-2 border-cyan-600 text-cyan-700 bg-cyan-50/50"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-5">
        {currentTab === "propulsion" && <PropulsionTab engines={engines} />}
        {currentTab === "cargo" && <CargoTab tonnage={tonnage} holds={holds} />}
        {currentTab === "navigation" && <NavigationTab nav={nav} certs={certs} />}
        {currentTab === "accommodation" && <AccommodationTab data={accommodation} />}
      </div>
    </div>
  );
}

/* ── Tab Content Components ────────────────────────────────── */

function PropulsionTab({ engines }: { engines: EngineInfo[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* Engine table */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Motorisering</h3>
        <div className="space-y-3">
          {engines.map((e, i) => (
            <div key={i} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  e.position === "main" ? "bg-cyan-100 text-cyan-800" :
                  e.position === "generator" ? "bg-violet-100 text-violet-800" :
                  e.position === "thruster" ? "bg-amber-100 text-amber-800" :
                  "bg-slate-100 text-slate-700"
                }`}>
                  {e.position === "main" ? "Motor" : e.position === "generator" ? "Generator" : e.position === "thruster" ? "Boegschroef" : "Keerkoppeling"}
                </span>
                <span className="text-sm font-semibold text-slate-900">{e.name ?? "Onbekend"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {e.hp && <span>{e.hp} pk</span>}
                {e.kw && <span>{e.kw} kW</span>}
                {e.year && <span>Bj. {e.year}</span>}
                {e.hours !== null && (
                  <span className={
                    e.hours < 5000 ? "text-emerald-600 font-medium" :
                    e.hours < 10000 ? "text-amber-600 font-medium" :
                    "text-red-600 font-medium"
                  }>
                    {e.hours.toLocaleString("nl-NL")} uur
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ship diagram */}
      <ShipDiagram engines={engines} />
    </div>
  );
}

function CargoTab({ tonnage, holds }: { tonnage: TonnageByDepth[]; holds: HoldInfo | null }) {
  return (
    <div className="space-y-6">
      {tonnage.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Tonnage per diepgang</h3>
          <TonnageByDepthChart data={tonnage} />
        </div>
      )}

      {holds && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Laadruimgegevens</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {holds.count !== null && (
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-400">Aantal ruimen</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{holds.count}</p>
              </div>
            )}
            {holds.height_m !== null && (
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-400">Ruimhoogte</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{holds.height_m}m</p>
              </div>
            )}
            {holds.floor && (
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-400">Buikdenning</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{holds.floor}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NavigationTab({ nav, certs }: { nav: NavigationEquipment | null; certs: Certificates | null }) {
  return (
    <div className="space-y-6">
      {nav && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Navigatieapparatuur</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <EquipItem label="Radar" available={nav.radar} />
            <EquipItem label="GPS" available={nav.gps} />
            <EquipItem label="AIS" available={nav.ais} />
            <EquipItem label="VHF / Marifoon" available={nav.vhf} />
            <EquipItem label="Camera's" available={nav.cameras} />
            <EquipItem label="Stuurautomaat" available={nav.autopilot} />
            <EquipItem label="Echolood" available={nav.depth_sounder} />
          </div>
        </div>
      )}

      {certs && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Certificaten</h3>
          <div className="space-y-2">
            {certs.adn && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-500">ADN</p>
                  <p className="text-sm font-semibold text-slate-800">{certs.adn}</p>
                </div>
              </div>
            )}
            {certs.classification && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-500">Classificatie</p>
                  <p className="text-sm font-semibold text-slate-800">{certs.classification}</p>
                </div>
              </div>
            )}
            {certs.other.map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm text-slate-700">{c}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccommodationTab({ data }: { data: Accommodation | null }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-900">Woonfaciliteiten</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {data.back_home && (
          <div className="rounded-lg border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Achterwoning</p>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{data.back_home}</p>
          </div>
        )}
        {data.front_home && (
          <div className="rounded-lg border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Voorwoning</p>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{data.front_home}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EquipItem({ label, available }: { label: string; available: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${available ? "bg-emerald-50" : "bg-slate-50"}`}>
      {available ? (
        <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-4 w-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={`text-xs font-medium ${available ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

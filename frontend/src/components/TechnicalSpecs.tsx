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
  extractHull,
  extractPropeller,
  extractTanks,
  extractDeckEquipment,
  extractWheelhouse,
  type EngineInfo,
  type NavigationEquipment,
  type Certificates,
  type Accommodation,
  type HoldInfo,
  type TonnageByDepth,
  type HullInfo,
  type PropellerInfo,
  type TanksInfo,
  type DeckEquipment,
  type WheelhouseInfo,
} from "@/lib/rawDetails";
import EngineOverview from "./ShipDiagram";
import TonnageByDepthChart from "./TonnageByDepthChart";

interface TechnicalSpecsProps {
  vessel: Vessel;
}

type TabId = "hull" | "propulsion" | "cargo" | "navigation" | "accommodation";

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
  const hull = extractHull(raw);
  const propeller = extractPropeller(raw);
  const tanks = extractTanks(raw);
  const deckEquip = extractDeckEquipment(raw);
  const wheelhouse = extractWheelhouse(raw);

  // Build available tabs
  const tabs: Tab[] = [];

  if (hull || wheelhouse) {
    tabs.push({
      id: "hull",
      label: "Scheepsgegevens",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      ),
    });
  }

  if (engines.length > 0 || propeller || tanks) {
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

  if (nav || certs || deckEquip) {
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
        {currentTab === "hull" && <HullTab hull={hull} wheelhouse={wheelhouse} />}
        {currentTab === "propulsion" && <PropulsionTab engines={engines} propeller={propeller} tanks={tanks} />}
        {currentTab === "cargo" && <CargoTab tonnage={tonnage} holds={holds} />}
        {currentTab === "navigation" && <NavigationTab nav={nav} certs={certs} deckEquip={deckEquip} />}
        {currentTab === "accommodation" && <AccommodationTab data={accommodation} />}
      </div>
    </div>
  );
}

/* ── Shared tile component ─────────────────────────────────── */

function SpecTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

/* ── Tab Content Components ────────────────────────────────── */

function HullTab({ hull, wheelhouse }: { hull: HullInfo | null; wheelhouse: WheelhouseInfo | null }) {
  return (
    <div className="space-y-6">
      {hull && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Scheepscasco</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {hull.build_yard && <SpecTile label="Bouwwerf" value={hull.build_yard} />}
            {hull.finishing_yard && hull.finishing_yard !== hull.build_yard && (
              <SpecTile label="Afbouwwerf" value={hull.finishing_yard} />
            )}
            {hull.construction_type && <SpecTile label="Scheepshuid" value={hull.construction_type} />}
            {hull.depth !== null && <SpecTile label="Diepgang" value={`${hull.depth}m`} />}
            {hull.creep_height && <SpecTile label="Kruiplijnhoogte" value={hull.creep_height} />}
          </div>
        </div>
      )}

      {wheelhouse && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Stuurhut</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {wheelhouse.type && <SpecTile label="Type stuurhut" value={wheelhouse.type} />}
            {wheelhouse.airco && <SpecTile label="Airco" value={wheelhouse.airco} />}
          </div>
        </div>
      )}
    </div>
  );
}

function PropulsionTab({ engines, propeller, tanks }: { engines: EngineInfo[]; propeller: PropellerInfo | null; tanks: TanksInfo | null }) {
  return (
    <div className="space-y-6">
      {engines.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Motorisering</h3>
          <EngineOverview engines={engines} />
        </div>
      )}

      {propeller && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Voortstuwing</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {propeller.screw && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="mt-0.5 h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-400">Schroef</p>
                  <p className="text-sm font-semibold text-slate-800">{propeller.screw}</p>
                </div>
              </div>
            )}
            {propeller.nozzle && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="mt-0.5 h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-400">Straalbuis</p>
                  <p className="text-sm font-semibold text-slate-800">{propeller.nozzle}</p>
                </div>
              </div>
            )}
            {propeller.steering && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="mt-0.5 h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-400">Stuurwerk</p>
                  <p className="text-sm font-semibold text-slate-800">{propeller.steering}</p>
                </div>
              </div>
            )}
            {propeller.bow_thruster_details && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="mt-0.5 h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-400">Boegschroef</p>
                  <p className="text-sm font-semibold text-slate-800">{propeller.bow_thruster_details}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tanks && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Verbruiksmedia</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tanks.fuel && (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-amber-100">
                <div className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  </svg>
                  <p className="text-xs font-medium text-amber-600">Brandstof</p>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{tanks.fuel}</p>
              </div>
            )}
            {tanks.fuel_front && (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-amber-100">
                <div className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  </svg>
                  <p className="text-xs font-medium text-amber-600">Brandstof (voor)</p>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{tanks.fuel_front}</p>
              </div>
            )}
            {tanks.drinking_water && (
              <div className="rounded-lg bg-sky-50 px-3 py-2.5 ring-1 ring-sky-100">
                <div className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                  <p className="text-xs font-medium text-sky-600">Drinkwater</p>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{tanks.drinking_water}</p>
              </div>
            )}
            {tanks.drinking_water_front && (
              <div className="rounded-lg bg-sky-50 px-3 py-2.5 ring-1 ring-sky-100">
                <div className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                  <p className="text-xs font-medium text-sky-600">Drinkwater (voor)</p>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{tanks.drinking_water_front}</p>
              </div>
            )}
            {tanks.lubricating_oil && (
              <div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
                <div className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                  <p className="text-xs font-medium text-slate-500">Smeerolie</p>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{tanks.lubricating_oil}</p>
              </div>
            )}
          </div>
        </div>
      )}
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
            {holds.count !== null && <SpecTile label="Aantal ruimen" value={holds.count} />}
            {holds.volume_m3 !== null && <SpecTile label="Ruiminhoud" value={`${holds.volume_m3} m\u00B3`} />}
            {holds.teu !== null && <SpecTile label="TEU capaciteit" value={holds.teu} />}
            {holds.height_m !== null && <SpecTile label="Ruimhoogte" value={`${holds.height_m}m`} />}
            {holds.ceiling_height !== null && <SpecTile label="Dennenboomhoogte" value={`${holds.ceiling_height}m`} />}
            {holds.hatches_type && <SpecTile label="Luiken" value={holds.hatches_type} />}
            {holds.hatches_count !== null && <SpecTile label="Aantal luiken" value={holds.hatches_count} />}
            {holds.wall_type && <SpecTile label="Wanden" value={holds.wall_type} />}
            {holds.floor_thickness && <SpecTile label="Vloerdikte" value={holds.floor_thickness} />}
            {holds.floor && <SpecTile label="Buikdenning" value={holds.floor} />}
          </div>
        </div>
      )}
    </div>
  );
}

function NavigationTab({ nav, certs, deckEquip }: { nav: NavigationEquipment | null; certs: Certificates | null; deckEquip: DeckEquipment | null }) {
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
            {certs.ship_attestation && <CertRow label="Certificaat van onderzoek" value={certs.ship_attestation} color="emerald" />}
            {certs.adn && <CertRow label="ADN" value={certs.adn} color="emerald" />}
            {certs.classification && <CertRow label="Classificatie" value={certs.classification} color="cyan" />}
            {certs.push_certificate && <CertRow label="Duwcertificaat" value={certs.push_certificate} color="cyan" />}
            {certs.green_award && <CertRow label="Green Award" value={certs.green_award} color="emerald" />}
            {certs.zone && <CertRow label="Zone 1 & 2" value={certs.zone} color="cyan" />}
            {certs.other.map((c, i) => (
              <CertRow key={i} label="Certificaat" value={c} color="slate" />
            ))}
          </div>
        </div>
      )}

      {deckEquip && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Dekuitrusting</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {deckEquip.car_crane && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="mt-0.5 h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-400">Autokraan</p>
                  <p className="text-sm font-semibold text-slate-800">{deckEquip.car_crane}</p>
                </div>
              </div>
            )}
            {(deckEquip.anchor_winch_front || deckEquip.anchor_winch_back) && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="mt-0.5 h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-400">Ankerlieren</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {deckEquip.anchor_winch_front}
                    {deckEquip.anchor_winch_front && deckEquip.anchor_winch_back && " / "}
                    {deckEquip.anchor_winch_back && deckEquip.anchor_winch_back !== deckEquip.anchor_winch_front && deckEquip.anchor_winch_back}
                  </p>
                </div>
              </div>
            )}
            {deckEquip.spud_poles && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <svg className="mt-0.5 h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l-6.75-6.75M12 19.5l6.75-6.75" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-slate-400">Spudpaal</p>
                  <p className="text-sm font-semibold text-slate-800">{deckEquip.spud_poles}</p>
                </div>
              </div>
            )}
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

/* ── Shared sub-components ─────────────────────────────────── */

function CertRow({ label, value, color }: { label: string; value: string; color: "emerald" | "cyan" | "slate" }) {
  const iconColor = color === "emerald" ? "text-emerald-500" : color === "cyan" ? "text-cyan-500" : "text-slate-400";
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
      <svg className={`h-4 w-4 ${iconColor} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-800">{value}</p>
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

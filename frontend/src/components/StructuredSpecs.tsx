"use client";

import React from "react";
import type {
  StructuredDetails,
  StructuredEngine,
  StructuredGenerator,
  StructuredBowThruster,
  StructuredCertificate,
  StructuredImprovement,
} from "@/lib/supabase";

interface StructuredSpecsProps {
  data: StructuredDetails;
}

/* ── Helpers ──────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-sm text-slate-500 shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-slate-800 text-right">{value}</dd>
    </div>
  );
}

function formatHp(hp: number | null | undefined): string | null {
  if (hp == null) return null;
  return `${hp} pk`;
}

function formatKva(kva: number | null | undefined): string | null {
  if (kva == null) return null;
  return `${kva} kVA`;
}

function formatLiters(l: number | null | undefined): string | null {
  if (l == null) return null;
  return `${l.toLocaleString("nl-NL")} L`;
}

/** Check if a certificate is expired, expiring soon, or valid */
function certStatus(validUntil: string | null | undefined): "valid" | "warning" | "expired" | "unknown" {
  if (!validUntil) return "unknown";
  const now = new Date();
  const year = parseInt(validUntil, 10);
  let expiry: Date;
  if (!isNaN(year) && validUntil.length === 4) {
    expiry = new Date(year, 11, 31);
  } else {
    expiry = new Date(validUntil);
    if (isNaN(expiry.getTime())) return "unknown";
  }
  if (expiry < now) return "expired";
  const sixMonths = new Date(now);
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  if (expiry < sixMonths) return "warning";
  return "valid";
}

const certStatusColors = {
  valid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  expired: "bg-red-50 text-red-700 ring-red-200",
  unknown: "bg-slate-50 text-slate-500 ring-slate-200",
};

const certStatusLabels = {
  valid: "Geldig",
  warning: "Verloopt binnenkort",
  expired: "Verlopen",
  unknown: "",
};

/* ── Engine Card ──────────────────────────────────────────── */

function EngineCard({ engine, index, total }: { engine: StructuredEngine; index: number; total: number }) {
  const title = total > 1 ? `${engine.make} (${index + 1})` : engine.make;
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {engine.type && <p className="text-xs text-slate-500 mt-0.5">{engine.type}</p>}
      <dl className="mt-2 space-y-0.5">
        <Row label="Vermogen" value={formatHp(engine.power_hp)} />
        <Row label="Bouwjaar" value={engine.year} />
        <Row label="Draaiuren" value={engine.hours != null ? `${engine.hours.toLocaleString("nl-NL")} uur${engine.hours_date ? ` (${engine.hours_date})` : ""}` : null} />
        <Row label="Revisie" value={engine.revision_year} />
        {engine.hours_since_revision != null && (
          <Row label="Uren na revisie" value={`${engine.hours_since_revision.toLocaleString("nl-NL")} uur`} />
        )}
        <Row label="Emissie" value={engine.emission_class} />
      </dl>
    </div>
  );
}

/* ── Generator Card ───────────────────────────────────────── */

function GeneratorCard({ gen, index, total }: { gen: StructuredGenerator; index: number; total: number }) {
  const title = total > 1 ? `${gen.make} (${index + 1})` : gen.make;
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {gen.type && <p className="text-xs text-slate-500 mt-0.5">{gen.type}</p>}
      <dl className="mt-2 space-y-0.5">
        <Row label="Vermogen" value={formatKva(gen.kva)} />
        <Row label="Bouwjaar" value={gen.year} />
        <Row label="Draaiuren" value={gen.hours != null ? `${gen.hours.toLocaleString("nl-NL")} uur` : null} />
      </dl>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────── */

export default function StructuredSpecs({ data }: StructuredSpecsProps) {
  const engines = data.engines?.filter((e) => e.make) ?? [];
  const generators = data.generators?.filter((g) => g.make) ?? [];
  const gearboxes = data.gearboxes?.filter((g) => g.make) ?? [];
  const bowThrusters = data.bow_thrusters?.filter((b) => b.make || b.power_hp) ?? [];
  const certs = data.certificates?.filter((c) => c.name) ?? [];
  const improvements = data.improvements?.filter((i) => i.year && i.description) ?? [];
  const holds = data.holds;
  const tanker = data.tanker;

  const hasIdentity = data.shipyard || data.finishing_yard || data.hull_year || data.eni_number || data.construction || data.double_hull != null;
  const hasDimensions = data.depth_m != null || data.airdraft_empty_m != null || data.airdraft_ballast_m != null || data.airdraft_lowered_m != null;
  const hasPropulsion = data.propeller || data.nozzle || data.steering || bowThrusters.length > 0;
  const hasEquipment = data.car_crane || data.spud_poles || data.anchor_winches || data.wheelhouse;
  const hasTanks = data.fuel_capacity_l != null || data.freshwater_capacity_l != null || tanker;
  const hasHolds = holds && (holds.count != null || holds.capacity_m3 != null || holds.teu != null || holds.dimensions || holds.wall_type || holds.hatch_type);
  const hasAccommodation = data.accommodation_aft || data.accommodation_fwd || data.bedrooms != null || data.airco != null;

  return (
    <div className="space-y-4">
      {/* Motoren */}
      {engines.length > 0 && (
        <Section title="Motoren">
          <div className={engines.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
            {engines.map((e, i) => (
              <EngineCard key={i} engine={e} index={i} total={engines.length} />
            ))}
          </div>
          {gearboxes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Keerkoppelingen</p>
              <dl className="space-y-0.5">
                {gearboxes.map((g, i) => (
                  <Row key={i} label={gearboxes.length > 1 ? `${g.make} (${i + 1})` : g.make} value={[g.type, g.year].filter(Boolean).join(", ") || "Ja"} />
                ))}
              </dl>
            </div>
          )}
        </Section>
      )}

      {/* Generatoren */}
      {generators.length > 0 && (
        <Section title="Generatoren">
          <div className={generators.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
            {generators.map((g, i) => (
              <GeneratorCard key={i} gen={g} index={i} total={generators.length} />
            ))}
          </div>
        </Section>
      )}

      {/* Certificaten */}
      {certs.length > 0 && (
        <Section title="Certificaten">
          <div className="space-y-2">
            {certs.map((c: StructuredCertificate, i: number) => {
              const status = certStatus(c.valid_until);
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                    {c.description && <p className="text-xs text-slate-500 truncate">{c.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.valid_until && (
                      <span className="text-xs text-slate-500">{c.valid_until}</span>
                    )}
                    {status !== "unknown" && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${certStatusColors[status]}`}>
                        {certStatusLabels[status]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Laadruim */}
      {hasHolds && holds && (
        <Section title="Laadruim">
          <dl className="space-y-0.5">
            <Row label="Aantal ruimen" value={holds.count} />
            <Row label="Capaciteit" value={holds.capacity_m3 != null ? `${holds.capacity_m3.toLocaleString("nl-NL")} m\u00B3` : null} />
            <Row label="TEU" value={holds.teu} />
            <Row label="Afmetingen" value={holds.dimensions} />
            <Row label="Wanden" value={holds.wall_type} />
            <Row label="Vloer" value={holds.floor_material} />
            {holds.floor_thickness_mm != null && <Row label="Vloerdikte" value={`${holds.floor_thickness_mm} mm`} />}
            <Row label="Luiken" value={[holds.hatch_make, holds.hatch_type].filter(Boolean).join(" — ") || null} />
            <Row label="Luiken bj." value={holds.hatch_year} />
          </dl>
        </Section>
      )}

      {/* Voortstuwing */}
      {hasPropulsion && (
        <Section title="Voortstuwing">
          <dl className="space-y-0.5">
            <Row label="Schroef" value={data.propeller} />
            <Row label="Straalbuis" value={data.nozzle} />
            <Row label="Roer" value={data.steering} />
          </dl>
          {bowThrusters.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Boegschroef</p>
              <dl className="space-y-0.5">
                {bowThrusters.map((b: StructuredBowThruster, i: number) => (
                  <Row key={i} label={b.make || `Boegschroef ${i + 1}`} value={[formatHp(b.power_hp), b.type, b.year].filter(Boolean).join(", ")} />
                ))}
              </dl>
            </div>
          )}
        </Section>
      )}

      {/* Uitrusting */}
      {hasEquipment && (
        <Section title="Uitrusting">
          <dl className="space-y-0.5">
            <Row label="Kraan" value={data.car_crane} />
            <Row label="Spudpalen" value={data.spud_poles} />
            <Row label="Ankerlier" value={data.anchor_winches} />
            <Row label="Stuurhuis" value={data.wheelhouse} />
          </dl>
        </Section>
      )}

      {/* Tanks */}
      {hasTanks && (
        <Section title="Tanks">
          <dl className="space-y-0.5">
            <Row label="Brandstof" value={formatLiters(data.fuel_capacity_l)} />
            <Row label="Drinkwater" value={formatLiters(data.freshwater_capacity_l)} />
          </dl>
          {tanker && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lading (tanker)</p>
              <dl className="space-y-0.5">
                <Row label="Tanks" value={tanker.tank_count} />
                <Row label="Capaciteit" value={tanker.capacity_m3 != null ? `${tanker.capacity_m3.toLocaleString("nl-NL")} m\u00B3` : null} />
                <Row label="Coating" value={tanker.coating} />
                <Row label="Leidingsysteem" value={tanker.pipe_system} />
                <Row label="Ladingpompen" value={tanker.cargo_pumps} />
                <Row label="Verwarming" value={tanker.heating} />
              </dl>
            </div>
          )}
        </Section>
      )}

      {/* Bouw & Identiteit */}
      {(hasIdentity || hasDimensions) && (
        <Section title="Bouw & Identiteit">
          <dl className="space-y-0.5">
            <Row label="Werf" value={data.shipyard} />
            <Row label="Afbouwwerf" value={data.finishing_yard} />
            <Row label="Casco bj." value={data.hull_year} />
            <Row label="ENI-nummer" value={data.eni_number} />
            <Row label="Constructie" value={data.construction} />
            <Row label="Dubbelwandig" value={data.double_hull != null ? (data.double_hull ? "Ja" : "Nee") : null} />
          </dl>
          {hasDimensions && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Maten</p>
              <dl className="space-y-0.5">
                <Row label="Holte" value={data.depth_m != null ? `${data.depth_m} m` : null} />
                <Row label="Kruiphoogte leeg" value={data.airdraft_empty_m != null ? `${data.airdraft_empty_m} m` : null} />
                <Row label="Kruiphoogte ballast" value={data.airdraft_ballast_m != null ? `${data.airdraft_ballast_m} m` : null} />
                <Row label="Kruiphoogte gestreken" value={data.airdraft_lowered_m != null ? `${data.airdraft_lowered_m} m` : null} />
              </dl>
            </div>
          )}
        </Section>
      )}

      {/* Accommodatie */}
      {hasAccommodation && (
        <Section title="Accommodatie">
          <dl className="space-y-0.5">
            <Row label="Achterschip" value={data.accommodation_aft} />
            <Row label="Voorschip" value={data.accommodation_fwd} />
            <Row label="Slaapkamers" value={data.bedrooms} />
            <Row label="Airco" value={data.airco != null ? (data.airco ? "Ja" : "Nee") : null} />
          </dl>
        </Section>
      )}

      {/* Recente vernieuwingen */}
      {improvements.length > 0 && (
        <Section title="Recente vernieuwingen">
          <div className="space-y-2">
            {improvements
              .sort((a: StructuredImprovement, b: StructuredImprovement) => b.year - a.year)
              .map((imp: StructuredImprovement, i: number) => (
                <div key={i} className="flex gap-3 py-1">
                  <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">{imp.year}</span>
                  <span className="text-sm text-slate-600">{imp.description}</span>
                </div>
              ))}
          </div>
        </Section>
      )}
    </div>
  );
}

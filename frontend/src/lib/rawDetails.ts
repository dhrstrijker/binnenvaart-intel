/**
 * Extraction utilities for the raw_details JSONB field across all data sources.
 *
 * RensenDriessen: Full API dump (~319 fields), direct key names like `main_engine_1`, `tonnage_2_50`
 * Galle: Section-prefixed keys like `motor > type`, `tonnenmaat > op 2m50 (t)`
 * GTS Schepen: Section-prefixed keys like `motor gegevens - motortype`
 * PC Shipbrokers: Lowercase HTML labels from table rows + `_gtag` object
 */

type Raw = Record<string, unknown> | null | undefined;

/* ── Types ─────────────────────────────────────────────────── */

export interface EngineInfo {
  name: string | null;
  hp: number | null;
  kw: number | null;
  year: number | null;
  hours: number | null;
  revision: string | null;
  position: "main" | "generator" | "thruster" | "gearbox";
}

export interface TonnageByDepth {
  depth_m: number;
  tonnage_t: number;
}

export interface NavigationEquipment {
  radar: boolean;
  gps: boolean;
  ais: boolean;
  vhf: boolean;
  cameras: boolean;
  autopilot: boolean;
  depth_sounder: boolean;
  extras: string[];
}

export interface Certificates {
  adn: string | null;
  classification: string | null;
  ship_attestation: string | null;
  push_certificate: string | null;
  green_award: string | null;
  zone: string | null;
  other: string[];
}

export interface Accommodation {
  back_home: string | null;
  front_home: string | null;
}

export interface HoldInfo {
  count: number | null;
  height_m: number | null;
  floor: string | null;
  volume_m3: number | null;
  teu: number | null;
  hatches_type: string | null;
  hatches_count: number | null;
  wall_type: string | null;
  floor_thickness: string | null;
  ceiling_height: number | null;
}

export interface HullInfo {
  build_yard: string | null;
  finishing_yard: string | null;
  depth: number | null;
  creep_height: string | null;
  construction_type: string | null;
}

export interface PropellerInfo {
  screw: string | null;
  nozzle: string | null;
  steering: string | null;
  bow_thruster_details: string | null;
}

export interface TanksInfo {
  fuel: string | null;
  fuel_front: string | null;
  drinking_water: string | null;
  drinking_water_front: string | null;
  lubricating_oil: string | null;
}

export interface DeckEquipment {
  car_crane: string | null;
  anchor_winch_front: string | null;
  anchor_winch_back: string | null;
  spud_poles: string | null;
}

export interface WheelhouseInfo {
  type: string | null;
  airco: string | null;
}

/* ── Helpers ───────────────────────────────────────────────── */

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function yearFrom(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function hoursFrom(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const cleaned = s.replace(/[.\s]/g, "").replace(",", ".");
  const m = cleaned.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Find a value by checking multiple candidate keys (case-insensitive partial match). */
function findVal(raw: Record<string, unknown>, patterns: string[]): unknown {
  const entries = Object.entries(raw);
  for (const pat of patterns) {
    const lp = pat.toLowerCase();
    for (const [k, v] of entries) {
      if (k.toLowerCase().includes(lp) && v !== null && v !== undefined && v !== "") {
        return v;
      }
    }
  }
  return null;
}

/** Collect all entries matching a pattern (case-insensitive). */
function findAll(raw: Record<string, unknown>, pattern: string): [string, unknown][] {
  const lp = pattern.toLowerCase();
  return Object.entries(raw).filter(([k, v]) => k.toLowerCase().includes(lp) && v !== null && v !== undefined && v !== "");
}

/* ── Extractors ────────────────────────────────────────────── */

export function extractEngines(raw: Raw): EngineInfo[] {
  if (!raw) return [];
  const engines: EngineInfo[] = [];

  // RensenDriessen: main_engine_1, main_engine_2, generator_1, bow_thruster_1, gearbox_type, etc.
  // Also: main_engine_1_hp, main_engine_1_year, main_engine_1_hours
  const rdMainKeys = findAll(raw, "main_engine");
  if (rdMainKeys.length > 0) {
    // Find numbered main engines
    const seen = new Set<string>();
    for (const [k] of rdMainKeys) {
      const m = k.match(/main_engine_?(\d+)?(?:_|$)/i);
      if (m) {
        const idx = m[1] ?? "1";
        if (seen.has(idx)) continue;
        seen.add(idx);
        const prefix = `main_engine_${idx}`;
        engines.push({
          name: str(raw[prefix] ?? raw[`main_engine_${idx}_type`] ?? raw["main_engine_1"]),
          hp: num(raw[`${prefix}_hp`] ?? raw[`${prefix}_pk`] ?? raw["main_engine_1_hp"]),
          kw: num(raw[`${prefix}_kw`]),
          year: yearFrom(raw[`${prefix}_year`] ?? raw[`${prefix}_build_year`]),
          hours: hoursFrom(raw[`${prefix}_hours`]),
          revision: str(raw[`${prefix}_revision`]),
          position: "main",
        });
      }
    }

    // Generators
    const genKeys = findAll(raw, "generator");
    const genSeen = new Set<string>();
    for (const [k] of genKeys) {
      const m = k.match(/generator_?(\d+)?(?:_|$)/i);
      if (m) {
        const idx = m[1] ?? "1";
        if (genSeen.has(idx)) continue;
        genSeen.add(idx);
        const prefix = `generator_${idx}`;
        const name = str(raw[prefix] ?? raw[`generator_${idx}_type`]);
        if (name) {
          engines.push({
            name,
            hp: num(raw[`${prefix}_hp`] ?? raw[`${prefix}_kva`]),
            kw: num(raw[`${prefix}_kw`] ?? raw[`${prefix}_kva`]),
            year: yearFrom(raw[`${prefix}_year`]),
            hours: hoursFrom(raw[`${prefix}_hours`]),
            revision: str(raw[`${prefix}_revision`]),
            position: "generator",
          });
        }
      }
    }

    // Thrusters (thruster_1, thruster_2, ... or bow_thruster_1, ...)
    const thrusterKeys = findAll(raw, "thruster");
    const thrusterSeen = new Set<string>();
    for (const [k] of thrusterKeys) {
      const m = k.match(/(?:bow_)?thruster_?(\d+)?(?:_|$)/i);
      if (m) {
        const idx = m[1] ?? "1";
        if (thrusterSeen.has(idx)) continue;
        thrusterSeen.add(idx);
        // Try both "thruster_N" and "bow_thruster_N" prefixes
        const prefix = raw[`thruster_${idx}`] !== undefined ? `thruster_${idx}` : `bow_thruster_${idx}`;
        const name = str(raw[prefix] ?? raw[`${prefix}_type`]);
        if (name) {
          engines.push({
            name,
            hp: num(raw[`${prefix}_hp`] ?? raw[`${prefix}_pk`]),
            kw: num(raw[`${prefix}_kw`]),
            year: yearFrom(raw[`${prefix}_year`]),
            hours: hoursFrom(raw[`${prefix}_hours`]),
            revision: str(raw[`${prefix}_revision`]),
            position: "thruster",
          });
        }
      }
    }

    // Gearboxes (gearbox_1, gearbox_2, ...)
    const gearboxKeys = findAll(raw, "gearbox");
    const gearboxSeen = new Set<string>();
    for (const [k] of gearboxKeys) {
      const m = k.match(/gearbox_?(\d+)?(?:_|$)/i);
      if (m) {
        const idx = m[1] ?? "1";
        if (gearboxSeen.has(idx)) continue;
        gearboxSeen.add(idx);
        const prefix = `gearbox_${idx}`;
        const name = str(raw[prefix] ?? raw[`${prefix}_type`] ?? raw["gearbox_type"]);
        if (name) {
          engines.push({
            name,
            hp: num(raw[`${prefix}_hp`]),
            kw: null,
            year: yearFrom(raw[`${prefix}_year`]),
            hours: hoursFrom(raw[`${prefix}_hours`]),
            revision: str(raw[`${prefix}_revision`]),
            position: "gearbox",
          });
        }
      }
    }

    return engines;
  }

  // Galle / GTS / PC: section-prefixed keys
  const motorEntries = findAll(raw, "motor");
  if (motorEntries.length > 0) {
    const name = str(findVal(raw, ["motortype", "motor > type", "motor > merk", "motor gegevens - motortype", "motor gegevens - merk"]));
    const hp = num(findVal(raw, ["motor > pk", "motor > vermogen", "motor gegevens - vermogen", "motorvermogen", "pk", "vermogen"]));
    const year = yearFrom(findVal(raw, ["motor > bouwjaar", "motor gegevens - bouwjaar motor"]));
    const hours = hoursFrom(findVal(raw, ["motor > draaiuren", "motor gegevens - draaiuren", "draaiuren"]));

    // GTS revision info
    const revision = str(findVal(raw, ["machinekamer - jaar revisie", "jaar revisie"]));
    const revHours = str(findVal(raw, ["draaiuren na revisie"]));
    const revStr = revision ? (revHours ? `${revision} (${revHours} uur na revisie)` : revision) : null;

    if (name || hp) {
      engines.push({ name, hp, kw: null, year, hours, revision: revStr, position: "main" });
    }
  }

  // Fallback for PC Shipbrokers: simple lowercase keys
  if (engines.length === 0) {
    const name = str(raw["motortype"] ?? raw["motor"] ?? raw["engine"]);
    const hp = num(raw["pk"] ?? raw["hp"] ?? raw["vermogen"]);
    if (name || hp) {
      engines.push({ name, hp, kw: null, year: null, hours: null, revision: null, position: "main" });
    }
  }

  return engines;
}

export function extractTonnageByDepth(raw: Raw): TonnageByDepth[] {
  if (!raw) return [];
  const results: TonnageByDepth[] = [];

  // RensenDriessen: tonnage_1_50, tonnage_2_00, tonnage_2_50, tonnage_2_60, tonnage_2_80, tonnage_3_00m, tonnage_3_50m, tonnage_max
  const depthMap: [string, number][] = [
    ["tonnage_1_50", 1.5],
    ["tonnage_2_00", 2.0],
    ["tonnage_2_50", 2.5],
    ["tonnage_2_60", 2.6],
    ["tonnage_2_80", 2.8],
    ["tonnage_3_00m", 3.0],
    ["tonnage_3_50m", 3.5],
  ];

  for (const [key, depth] of depthMap) {
    const t = num(raw[key]);
    if (t !== null && t > 0) {
      results.push({ depth_m: depth, tonnage_t: t });
    }
  }

  // tonnage_max as special "max" entry
  const tMax = num(raw["tonnage_max"]);
  if (tMax !== null && tMax > 0) {
    // Only add if we don't already have it at a depth
    const maxDepth = results.length > 0 ? Math.max(...results.map((r) => r.depth_m)) + 0.5 : 4.0;
    if (!results.some((r) => r.tonnage_t === tMax)) {
      results.push({ depth_m: maxDepth, tonnage_t: tMax });
    }
  }

  if (results.length > 0) return results;

  // Galle: keys like "tonnenmaat > op 2m50 (t)" or "tonnenmaat > maximum diepgang (t)"
  const tonnEntries = findAll(raw, "tonnenmaat");
  for (const [k, v] of tonnEntries) {
    const t = num(v);
    if (t === null || t <= 0) continue;

    // Try to extract depth from key
    const depthMatch = k.match(/(\d)[,.]?(\d{2})/);
    if (depthMatch) {
      const depth = parseFloat(`${depthMatch[1]}.${depthMatch[2]}`);
      results.push({ depth_m: depth, tonnage_t: t });
    } else if (k.toLowerCase().includes("max")) {
      results.push({ depth_m: 4.0, tonnage_t: t });
    }
  }

  // GTS: section-prefixed like "tonnenmaat - laadvermogen op 2,50m"
  if (results.length === 0) {
    const gtsEntries = findAll(raw, "laadvermogen");
    for (const [k, v] of gtsEntries) {
      const t = num(v);
      if (t === null || t <= 0) continue;
      const depthMatch = k.match(/(\d)[,.]?(\d{2})/);
      if (depthMatch) {
        const depth = parseFloat(`${depthMatch[1]}.${depthMatch[2]}`);
        results.push({ depth_m: depth, tonnage_t: t });
      }
    }
  }

  return results.sort((a, b) => a.depth_m - b.depth_m);
}

export function extractNavigation(raw: Raw): NavigationEquipment | null {
  if (!raw) return null;

  const nav: NavigationEquipment = {
    radar: false,
    gps: false,
    ais: false,
    vhf: false,
    cameras: false,
    autopilot: false,
    depth_sounder: false,
    extras: [],
  };

  const allText = Object.entries(raw)
    .filter(([k]) => {
      const lk = k.toLowerCase();
      return lk.includes("navigati") || lk.includes("electronica") || lk.includes("communicat") || lk.includes("uitrusting");
    })
    .map(([, v]) => String(v).toLowerCase())
    .join(" ");

  // Also check top-level boolean/string fields from RensenDriessen
  const allKeys = Object.keys(raw).join(" ").toLowerCase();
  const allVals = Object.values(raw)
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();

  const searchText = `${allText} ${allKeys} ${allVals}`;

  if (/radar/i.test(searchText)) nav.radar = true;
  if (/gps/i.test(searchText)) nav.gps = true;
  if (/\bais\b/i.test(searchText)) nav.ais = true;
  if (/\bvhf\b|marifoon/i.test(searchText)) nav.vhf = true;
  if (/camera/i.test(searchText)) nav.cameras = true;
  if (/autopilot|stuurautomaat/i.test(searchText)) nav.autopilot = true;
  if (/echolood|dieptemeter|depth.?sounder/i.test(searchText)) nav.depth_sounder = true;

  // Check if any equipment was found
  const hasEquipment = nav.radar || nav.gps || nav.ais || nav.vhf || nav.cameras || nav.autopilot || nav.depth_sounder;
  return hasEquipment ? nav : null;
}

export function extractCertificates(raw: Raw): Certificates | null {
  if (!raw) return null;

  const adn = str(findVal(raw, ["adn", "adn certificaat", "adn-certificaat"]));
  const classification = str(findVal(raw, ["classificatie", "classification", "klasse"]));
  const ship_attestation = str(findVal(raw, [
    "certificate_shipsattest", "scheepsattest", "certificaat van onderzoek",
    "algemene gegevens - certificaat van onderzoek", "communautair binnenvaart certificaat",
  ]));
  const push_certificate = str(findVal(raw, [
    "duwcertificaat", "push_certificate", "aanvullend certificaat",
  ]));
  const green_award = str(findVal(raw, ["green award", "green_award"]));
  const zone = str(findVal(raw, ["zone 1", "zone 1 & 2", "zone 2"]));

  const known = new Set([adn, classification, ship_attestation, push_certificate, green_award, zone].filter(Boolean));
  const other: string[] = [];
  const certEntries = findAll(raw, "certificat");
  for (const [, v] of certEntries) {
    const s = str(v);
    if (s && !known.has(s)) other.push(s);
  }

  if (!adn && !classification && !ship_attestation && !push_certificate && !green_award && !zone && other.length === 0) return null;
  return { adn, classification, ship_attestation, push_certificate, green_award, zone, other };
}

export function extractAccommodation(raw: Raw): Accommodation | null {
  if (!raw) return null;

  const back = str(
    findVal(raw, [
      "achterwoning", "achter woning", "achterschip",
      "accommodatie achter", "woning achter",
      "accommodatie - achterwoning", "woonruimte - achter",
    ])
  );
  const front = str(
    findVal(raw, [
      "voorwoning", "voor woning", "voorschip",
      "accommodatie voor", "woning voor",
      "accommodatie - voorwoning", "woonruimte - voor",
    ])
  );

  if (!back && !front) return null;
  return { back_home: back, front_home: front };
}

export function extractHolds(raw: Raw): HoldInfo | null {
  if (!raw) return null;

  const count = num(findVal(raw, ["aantal ruimen", "ruimen", "holds", "number_of_holds", "laadruimen"]));
  const height = num(findVal(raw, ["ruimhoogte", "hold_height", "hoogte ruim"]));
  const floor = str(findVal(raw, ["buikdenning", "floor", "vloer ruim", "buikdenning - materiaal"]));
  const volume_m3 = num(findVal(raw, [
    "content_ship_space_capacity", "ruiminhoud", "totale ruiminhoud",
    "middenschip - totale ruiminhoud", "ruimen > ruiminhoud",
  ]));
  const teu = num(findVal(raw, [
    "total_teu", "teu", "teu's", "containers (teu)", "ruimen > containers",
  ]));
  const hatches_type = str(findVal(raw, [
    "luiken", "luiken > type", "middenschip - luiken", "hatches",
  ]));
  const hatches_count = num(findVal(raw, [
    "aantal luiken", "luiken > aantal", "hatches_count",
  ]));
  const wall_type = str(findVal(raw, [
    "wanden", "middenschip - wanden", "wall_type",
  ]));
  const floor_thickness = str(findVal(raw, [
    "dikte vloer", "middenschip - dikte vloer", "vloerdikte",
  ]));
  const ceiling_height = num(findVal(raw, [
    "hoogte den", "dennenboomhoogte", "middenschip - dennenboomhoogte",
    "breedte tussen den", "ceiling_height",
  ]));

  const hasData = count !== null || height !== null || floor || volume_m3 !== null ||
    teu !== null || hatches_type || hatches_count !== null || wall_type ||
    floor_thickness || ceiling_height !== null;

  if (!hasData) return null;
  return { count, height_m: height, floor, volume_m3, teu, hatches_type, hatches_count, wall_type, floor_thickness, ceiling_height };
}

export function extractHull(raw: Raw): HullInfo | null {
  if (!raw) return null;

  const build_yard = str(findVal(raw, [
    "build_yard", "bouwwerf", "scheepswerf",
    "algemene gegevens - bouwwerf",
  ]));
  const finishing_yard = str(findVal(raw, [
    "finishing_yard", "afbouwwerf",
  ]));
  const depth = num(findVal(raw, [
    "ship_depth", "diepgang", "afmetingen > diepgang",
    "algemene gegevens - diepgang",
  ]));
  const creep_height = str(findVal(raw, [
    "creep_height_without_ballast", "kruiplijnhoogte", "kruiphoogte zonder ballast",
    "algemene gegevens - kruiplijnhoogte",
  ]));
  const construction_type = str(findVal(raw, [
    "construction_type", "bouw huid schip", "gelast-geklonken",
    "algemene gegevens - gelast", "scheepshuid",
  ]));

  if (!build_yard && !finishing_yard && depth === null && !creep_height && !construction_type) return null;
  return { build_yard, finishing_yard, depth, creep_height, construction_type };
}

export function extractPropeller(raw: Raw): PropellerInfo | null {
  if (!raw) return null;

  const screw = str(findVal(raw, [
    "other_screw", "schroef", "schroefgrootte",
    "machinekamer - schroefgrootte",
  ]));
  const nozzle = str(findVal(raw, [
    "straalbuis", "nozzle",
    "machinekamer - straalbuis",
  ]));
  const steering = str(findVal(raw, [
    "machines_steering", "stuurwerk", "stuurwerkinstallatie",
    "overige - stuurwerk", "stuurwerkinstallatie > stuurwerk",
  ]));
  const bow_thruster_details = str(findVal(raw, [
    "boegschroef", "boegschroef (systeem", "boegschroefmotor",
  ]));

  if (!screw && !nozzle && !steering && !bow_thruster_details) return null;
  return { screw, nozzle, steering, bow_thruster_details };
}

export function extractTanks(raw: Raw): TanksInfo | null {
  if (!raw) return null;

  const fuel = str(findVal(raw, [
    "fuel", "brandstof", "gasolietank achter",
    "machinekamer - gasolietank achter",
  ]));
  const fuel_front = str(findVal(raw, [
    "fuel_frontship", "gasolietank voor",
    "voormachinekamer - gasolietank voor",
  ]));
  const drinking_water = str(findVal(raw, [
    "drinking_water", "drinkwater", "watertank achter",
    "machinekamer - watertank achter",
  ]));
  const drinking_water_front = str(findVal(raw, [
    "drinking_water_frontship", "watertank voor",
    "voormachinekamer - watertank voor",
  ]));
  const lubricating_oil = str(findVal(raw, [
    "lubricating_oil", "smeerolie",
  ]));

  if (!fuel && !fuel_front && !drinking_water && !drinking_water_front && !lubricating_oil) return null;
  return { fuel, fuel_front, drinking_water, drinking_water_front, lubricating_oil };
}

export function extractDeckEquipment(raw: Raw): DeckEquipment | null {
  if (!raw) return null;

  const car_crane = str(findVal(raw, [
    "other_car_crane", "autokraan", "overige - autokraan",
  ]));
  const anchor_winch_front = str(findVal(raw, [
    "other_windlass_frontship", "ankerlier voor", "ankerlieren",
    "overige - ankerlieren",
  ]));
  const anchor_winch_back = str(findVal(raw, [
    "other_windlass_backship", "ankerlier achter",
  ]));
  const spud_poles = str(findVal(raw, [
    "spudpaal", "spud_pole", "overige - spudpaal",
  ]));

  if (!car_crane && !anchor_winch_front && !anchor_winch_back && !spud_poles) return null;
  return { car_crane, anchor_winch_front, anchor_winch_back, spud_poles };
}

export function extractWheelhouse(raw: Raw): WheelhouseInfo | null {
  if (!raw) return null;

  const type = str(findVal(raw, [
    "wheel_house", "stuurhuis", "type stuurhut",
    "stuurhut - type stuurhut",
  ]));
  const airco = str(findVal(raw, [
    "airco", "stuurhut - airco",
  ]));

  if (!type && !airco) return null;
  return { type, airco };
}

export function extractRecentRenewals(raw: Raw): string | null {
  if (!raw) return null;

  // PC Shipbrokers: "recente vernieuwingen"
  const renewals = str(findVal(raw, ["recente vernieuwingen"]));
  if (renewals) return renewals;

  // GTS: "toelichting" or "bijzonderheden"
  const remarks = str(findVal(raw, [
    "algemene gegevens - toelichting", "toelichting",
    "algemene gegevens - bijzonderheden", "bijzonderheden",
  ]));
  return remarks;
}

/** Quick check: does this vessel have enough raw_details to show rich sections? */
export function hasRichData(raw: Raw): boolean {
  if (!raw) return false;
  return (
    extractEngines(raw).length > 0 ||
    extractTonnageByDepth(raw).length > 0 ||
    extractNavigation(raw) !== null ||
    extractCertificates(raw) !== null ||
    extractAccommodation(raw) !== null ||
    extractHolds(raw) !== null ||
    extractHull(raw) !== null ||
    extractPropeller(raw) !== null ||
    extractTanks(raw) !== null ||
    extractDeckEquipment(raw) !== null ||
    extractWheelhouse(raw) !== null
  );
}

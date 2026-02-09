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
            position: "generator",
          });
        }
      }
    }

    // Bow thruster
    const thruster = str(raw["bow_thruster_1"] ?? raw["bow_thruster_type"] ?? raw["bow_thruster"]);
    if (thruster) {
      engines.push({
        name: thruster,
        hp: num(raw["bow_thruster_1_hp"] ?? raw["bow_thruster_hp"]),
        kw: num(raw["bow_thruster_1_kw"] ?? raw["bow_thruster_kw"]),
        year: null,
        hours: null,
        position: "thruster",
      });
    }

    // Gearbox
    const gearbox = str(raw["gearbox_type"] ?? raw["gearbox_1"] ?? raw["gearbox"]);
    if (gearbox) {
      engines.push({
        name: gearbox,
        hp: null,
        kw: null,
        year: null,
        hours: null,
        position: "gearbox",
      });
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

    if (name || hp) {
      engines.push({ name, hp, kw: null, year, hours, position: "main" });
    }
  }

  // Fallback for PC Shipbrokers: simple lowercase keys
  if (engines.length === 0) {
    const name = str(raw["motortype"] ?? raw["motor"] ?? raw["engine"]);
    const hp = num(raw["pk"] ?? raw["hp"] ?? raw["vermogen"]);
    if (name || hp) {
      engines.push({ name, hp, kw: null, year: null, hours: null, position: "main" });
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
  const classification = str(findVal(raw, ["classificatie", "classification", "klasse", "scheepsattest", "certificaat van onderzoek"]));

  const other: string[] = [];
  const certEntries = findAll(raw, "certificat");
  for (const [, v] of certEntries) {
    const s = str(v);
    if (s && s !== adn && s !== classification) other.push(s);
  }

  if (!adn && !classification && other.length === 0) return null;
  return { adn, classification, other };
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

  if (count === null && height === null && !floor) return null;
  return { count, height_m: height, floor };
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
    extractHolds(raw) !== null
  );
}

/**
 * Extraction utilities for the raw_details JSONB field across all data sources.
 *
 * RensenDriessen: Full API dump (~319 fields), direct key names like `main_engine_1`, `tonnage_2_50`
 * Galle: Section-prefixed keys like `motor > type`, `tonnenmaat > op 2m50 (t)`
 * GTS Schepen: Nested JSON objects like `general.tonnage.at2m50`, `technics.engines[0].make`
 * PC Shipbrokers: Lowercase HTML labels from table rows + `_gtag` object
 */

type Raw = Record<string, unknown> | null | undefined;

/* ── Types ─────────────────────────────────────────────────── */

export interface TonnageByDepth {
  depth_m: number;
  tonnage_t: number;
}

export interface RawDetailGroup {
  section: string;
  items: { label: string; value: string }[];
}

/* ── Helpers ───────────────────────────────────────────────── */

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

/** Collect all entries matching a pattern (case-insensitive). */
function findAll(raw: Record<string, unknown>, pattern: string): [string, unknown][] {
  const lp = pattern.toLowerCase();
  return Object.entries(raw).filter(([k, v]) => k.toLowerCase().includes(lp) && v !== null && v !== undefined && v !== "");
}

/** Convert camelCase to spaced words. */
function camelToSpaces(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** Format a key into a human-readable label. */
function cleanLabel(label: string): string {
  let l = label.replace(/_/g, " ");
  l = camelToSpaces(l);
  l = l.trim();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** Format a value for display (booleans, dates). */
function formatValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "Ja" : "Nee";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
  }
  return String(val);
}

/** Keys to skip at any nesting level (internal metadata). */
const SKIP_KEYS = new Set([
  "pricevisible", "status", "new", "new_price", "price",
  "laststatuschangedate", "runninghoursdatestamp", "gsk_type",
]);

/** Recursively flatten a nested object into label/value pairs. */
function flattenObject(
  obj: Record<string, unknown>,
  prefix: string = "",
): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];

  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined || val === "") continue;
    if (key.startsWith("_")) continue;
    if (SKIP_KEYS.has(key.toLowerCase())) continue;

    const fullKey = prefix ? `${prefix} ${key}` : key;

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (typeof item === "object" && item !== null) {
          const indexed = val.length > 1 ? `${fullKey} ${i + 1}` : fullKey;
          items.push(...flattenObject(item as Record<string, unknown>, indexed));
        } else if (item !== null && item !== undefined && item !== "") {
          const sv = String(item);
          if (sv.length <= 500) {
            items.push({ label: cleanLabel(fullKey), value: formatValue(item) });
          }
        }
      }
    } else if (typeof val === "object") {
      items.push(...flattenObject(val as Record<string, unknown>, fullKey));
    } else {
      const sv = String(val);
      if (sv.length > 3000) continue;
      items.push({ label: cleanLabel(fullKey), value: formatValue(val) });
    }
  }

  return items;
}

/* ── Extractors ────────────────────────────────────────────── */

export function extractTonnageByDepth(raw: Raw): TonnageByDepth[] {
  if (!raw) return [];
  const results: TonnageByDepth[] = [];

  // Try to find the vessel's actual maximum draft for placing maxTonnage
  const general = raw["general"];
  const generalObj = general && typeof general === "object" && !Array.isArray(general)
    ? (general as Record<string, unknown>)
    : null;
  const vesselDims = generalObj?.["vesselDimensions"];
  const dimsObj = vesselDims && typeof vesselDims === "object" && !Array.isArray(vesselDims)
    ? (vesselDims as Record<string, unknown>)
    : null;
  const draft = num(raw["draft"])
    ?? num(raw["diepgang"])
    ?? num(dimsObj?.["draft"])
    ?? null;

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

  // tonnage_max as special "max" entry — use actual draft as depth
  const tMax = num(raw["tonnage_max"]);
  if (tMax !== null && tMax > 0) {
    if (!results.some((r) => r.tonnage_t === tMax)) {
      const maxDepth = draft ?? (results.length > 0 ? Math.max(...results.map((r) => r.depth_m)) + 0.5 : 4.0);
      results.push({ depth_m: maxDepth, tonnage_t: tMax });
    }
  }

  if (results.length > 0) return results;

  // GTS Schepen (nested format): general.tonnage.at1m90, at2m20, at2m50, maxTonnage
  if (generalObj) {
    const tonnage = generalObj["tonnage"];
    if (tonnage && typeof tonnage === "object" && !Array.isArray(tonnage)) {
      const tonnageObj = tonnage as Record<string, unknown>;
      for (const [k, v] of Object.entries(tonnageObj)) {
        const t = num(v);
        if (t === null || t <= 0) continue;
        const m = k.match(/at(\d)m(\d{2})/);
        if (m) {
          results.push({ depth_m: parseFloat(`${m[1]}.${m[2]}`), tonnage_t: t });
        } else if (k.toLowerCase().includes("max")) {
          if (!results.some((r) => r.tonnage_t === t)) {
            const maxDepth = draft ?? (results.length > 0 ? Math.max(...results.map((r) => r.depth_m)) + 0.5 : 4.0);
            results.push({ depth_m: maxDepth, tonnage_t: t });
          }
        }
      }
    }
  }

  if (results.length > 0) return results.sort((a, b) => a.depth_m - b.depth_m);

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

  // GTS (old flat format): section-prefixed like "tonnenmaat - laadvermogen op 2,50m"
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

/**
 * Group raw_details into labelled sections for display.
 * Handles flat keys (RD/PC), section-prefixed keys (Galle ` > `, GTS ` - `),
 * and nested objects (GTS new format).
 */
export function groupRawDetails(raw: Raw): RawDetailGroup[] {
  if (!raw) return [];
  const groups = new Map<string, { label: string; value: string }[]>();

  for (const [key, val] of Object.entries(raw)) {
    if (val === null || val === undefined || val === "") continue;
    if (key.startsWith("_")) continue;
    if (SKIP_KEYS.has(key.toLowerCase())) continue;

    // Nested objects/arrays: flatten recursively, use top-level key as section
    if (typeof val === "object") {
      const section = cleanLabel(key);
      let items: { label: string; value: string }[];

      if (Array.isArray(val)) {
        items = [];
        for (let i = 0; i < val.length; i++) {
          const item = val[i];
          if (typeof item === "object" && item !== null) {
            const prefix = val.length > 1 ? String(i + 1) : "";
            items.push(...flattenObject(item as Record<string, unknown>, prefix));
          }
        }
      } else {
        items = flattenObject(val as Record<string, unknown>);
      }

      if (items.length > 0) {
        if (!groups.has(section)) groups.set(section, []);
        groups.get(section)!.push(...items);
      }
      continue;
    }

    // Skip long strings (PC Shipbrokers junk concatenations)
    if (typeof val === "string" && val.length > 200) continue;

    let section = "Algemeen";
    let label = key;

    if (key.includes(" > ")) {
      // Galle format: "motor > type"
      const idx = key.indexOf(" > ");
      section = key.slice(0, idx).trim();
      label = key.slice(idx + 3).trim();
    } else if (key.includes(" - ")) {
      // GTS old format: "motor gegevens - motortype"
      const idx = key.indexOf(" - ");
      section = key.slice(0, idx).trim();
      label = key.slice(idx + 3).trim();
    }

    // Clean up label: underscores → spaces, capitalize first letter
    label = label.replace(/_/g, " ");
    label = camelToSpaces(label);
    label = label.charAt(0).toUpperCase() + label.slice(1);

    // Capitalize section
    section = section.charAt(0).toUpperCase() + section.slice(1);

    // Format booleans
    const display = typeof val === "boolean" ? (val ? "Ja" : "Nee") : String(val);

    if (!groups.has(section)) groups.set(section, []);
    groups.get(section)!.push({ label, value: display });
  }

  // Sort: named sections first (alphabetically), "Algemeen" last
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "Algemeen") return 1;
      if (b === "Algemeen") return -1;
      return a.localeCompare(b);
    })
    .map(([section, items]) => ({ section, items }));
}

/** Quick check: does this vessel have raw_details worth showing? */
export function hasRichData(raw: Raw): boolean {
  if (!raw) return false;
  return Object.keys(raw).some((k) => !k.startsWith("_"));
}

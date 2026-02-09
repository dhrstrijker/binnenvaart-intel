import { SOURCE_CONFIG } from "@/lib/sources";

export interface SavedSearchFilters {
  search?: string;
  type?: string;
  source?: string;
  minPrice?: string;
  maxPrice?: string;
  minLength?: string;
  maxLength?: string;
  minWidth?: string;
  maxWidth?: string;
  minBuildYear?: string;
  maxBuildYear?: string;
  minTonnage?: string;
  maxTonnage?: string;
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string | null;
  filters: SavedSearchFilters;
  frequency: "immediate" | "daily" | "weekly";
  active: boolean;
  created_at: string;
}

export const MAX_FREE_SEARCHES = 2;

export const SOURCE_OPTIONS = Object.entries(SOURCE_CONFIG).map(([key, { label }]) => ({
  value: key,
  label,
}));

export const COMMON_TYPES = [
  "Motorvrachtschip",
  "Tankschip",
  "Duw/Sleepboot",
  "Duwbak",
  "Koppelverband",
  "Beunschip",
  "Passagiersschip",
  "Woonschip",
  "Jacht",
  "Kraanschip",
  "Ponton",
  "Accomodatieschip",
  "Nieuwbouw",
  "Overige",
];

export function getFilterPills(filters: SavedSearchFilters): { label: string }[] {
  const pills: { label: string }[] = [];

  if (filters.search) pills.push({ label: `"${filters.search}"` });
  if (filters.type) pills.push({ label: filters.type });
  if (filters.source) {
    const src = SOURCE_CONFIG[filters.source];
    pills.push({ label: src?.label ?? filters.source });
  }
  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice ? `€${parseInt(filters.minPrice).toLocaleString("nl-NL")}` : "";
    const max = filters.maxPrice ? `€${parseInt(filters.maxPrice).toLocaleString("nl-NL")}` : "";
    if (min && max) pills.push({ label: `${min} – ${max}` });
    else if (min) pills.push({ label: `Vanaf ${min}` });
    else pills.push({ label: `Tot ${max}` });
  }
  if (filters.minLength || filters.maxLength) {
    const min = filters.minLength ? `${filters.minLength}m` : "";
    const max = filters.maxLength ? `${filters.maxLength}m` : "";
    if (min && max) pills.push({ label: `Lengte ${min} – ${max}` });
    else if (min) pills.push({ label: `Lengte vanaf ${min}` });
    else pills.push({ label: `Lengte tot ${max}` });
  }
  if (filters.minWidth || filters.maxWidth) {
    const min = filters.minWidth ? `${filters.minWidth}m` : "";
    const max = filters.maxWidth ? `${filters.maxWidth}m` : "";
    if (min && max) pills.push({ label: `Breedte ${min} – ${max}` });
    else if (min) pills.push({ label: `Breedte vanaf ${min}` });
    else pills.push({ label: `Breedte tot ${max}` });
  }
  if (filters.minBuildYear || filters.maxBuildYear) {
    const min = filters.minBuildYear ?? "";
    const max = filters.maxBuildYear ?? "";
    if (min && max) pills.push({ label: `Bouwjaar ${min} – ${max}` });
    else if (min) pills.push({ label: `Bouwjaar vanaf ${min}` });
    else pills.push({ label: `Bouwjaar tot ${max}` });
  }
  if (filters.minTonnage || filters.maxTonnage) {
    const min = filters.minTonnage ? `${parseInt(filters.minTonnage).toLocaleString("nl-NL")}t` : "";
    const max = filters.maxTonnage ? `${parseInt(filters.maxTonnage).toLocaleString("nl-NL")}t` : "";
    if (min && max) pills.push({ label: `Tonnage ${min} – ${max}` });
    else if (min) pills.push({ label: `Tonnage vanaf ${min}` });
    else pills.push({ label: `Tonnage tot ${max}` });
  }

  return pills;
}

/** Generate a human-readable display name from filter values. */
export function generateSearchName(filters: SavedSearchFilters): string {
  const pills = getFilterPills(filters);
  if (pills.length === 0) return "Alle schepen";
  return pills.map((p) => p.label).join(", ");
}

import type { Vessel } from "./supabase";
import { sourceLabel } from "./sources";

export const SITE_URL = "https://navisio.nl";

export function buildVesselTitle(vessel: Vessel): string {
  const parts = [vessel.name];
  if (vessel.type) parts.push(vessel.type);
  if (vessel.length_m) parts.push(`${vessel.length_m}m`);
  parts.push("te koop");
  return parts.join(" - ");
}

export function buildVesselDescription(vessel: Vessel): string {
  const parts: string[] = [];

  if (vessel.type) parts.push(vessel.type);
  parts.push(vessel.name);

  const specs: string[] = [];
  if (vessel.length_m && vessel.width_m) {
    specs.push(`${vessel.length_m} x ${vessel.width_m}m`);
  }
  if (vessel.build_year) specs.push(`bouwjaar ${vessel.build_year}`);
  if (vessel.tonnage) specs.push(`${vessel.tonnage}t`);
  if (specs.length > 0) parts.push(`(${specs.join(", ")})`);

  if (vessel.price !== null) {
    const formatted = new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(vessel.price);
    parts.push(`te koop voor ${formatted}`);
  } else {
    parts.push("te koop, prijs op aanvraag");
  }

  parts.push(`bij ${sourceLabel(vessel.source)}.`);

  return parts.join(" ");
}

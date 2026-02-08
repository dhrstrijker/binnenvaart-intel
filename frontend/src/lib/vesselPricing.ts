import { Vessel } from "@/lib/supabase";

interface Coefficients {
  length: number;
  tonnage: number;
  build_year: number;
  intercept: number;
  r2: number;
  label: string;
}

export const TYPE_COEFFICIENTS: Record<string, Coefficients> = {
  Motorvrachtschip: {
    length: 5680.45,
    tonnage: 697.91,
    build_year: 16382.36,
    intercept: -32785231.98,
    r2: 0.926,
    label: "Motorvrachtschip",
  },
  Tankschip: {
    length: 12761.84,
    tonnage: 545.76,
    build_year: 26316.55,
    intercept: -52005837.38,
    r2: 0.526,
    label: "Tankschip",
  },
  Duwbak: {
    length: 10534.15,
    tonnage: 57.28,
    build_year: 11943.15,
    intercept: -24016119.95,
    r2: 0.398,
    label: "Duwbak",
  },
  _fallback: {
    length: 8390.53,
    tonnage: 481.93,
    build_year: 23317.8,
    intercept: -46208569.38,
    r2: 0.736,
    label: "Alle typen",
  },
};

const MIN_PRICE = 10_000;
const MAX_PRICE = 15_000_000;

function getCoefficients(type: string | null | undefined): Coefficients {
  if (type && TYPE_COEFFICIENTS[type]) return TYPE_COEFFICIENTS[type];
  return TYPE_COEFFICIENTS._fallback;
}

export function predictPrice(vessel: Vessel): number | null {
  if (vessel.length_m == null || vessel.build_year == null) return null;

  const coeff = getCoefficients(vessel.type);
  let predicted =
    coeff.intercept +
    coeff.length * vessel.length_m +
    coeff.build_year * vessel.build_year +
    coeff.tonnage * (vessel.tonnage ?? 0);

  predicted = Math.max(MIN_PRICE, Math.min(MAX_PRICE, predicted));
  return Math.round(predicted);
}

export interface PriceFactor {
  label: string;
  rawValue: string;
  contribution: number;
}

export interface PriceExplanationData {
  predicted: number;
  factors: PriceFactor[];
  coefficients: Coefficients;
  pctDiff: number | null; // positive = actual is cheaper than predicted (good deal)
}

export function explainPrice(vessel: Vessel): PriceExplanationData | null {
  if (vessel.length_m == null || vessel.build_year == null) return null;

  const coeff = getCoefficients(vessel.type);
  const age = new Date().getFullYear() - vessel.build_year;

  const factors: PriceFactor[] = [
    {
      label: "Lengte",
      rawValue: `${vessel.length_m}m`,
      contribution: Math.round(coeff.length * vessel.length_m),
    },
    {
      label: "Bouwjaar",
      rawValue: `${vessel.build_year} (${age}j)`,
      contribution: Math.round(coeff.build_year * vessel.build_year),
    },
  ];

  if (vessel.tonnage != null && vessel.tonnage > 0) {
    factors.push({
      label: "Tonnage",
      rawValue: `${vessel.tonnage}t`,
      contribution: Math.round(coeff.tonnage * vessel.tonnage),
    });
  }

  const predicted = predictPrice(vessel);
  if (predicted === null) return null;

  let pctDiff: number | null = null;
  if (vessel.price != null && predicted > 0) {
    pctDiff = ((predicted - vessel.price) / predicted) * 100;
  }

  return { predicted, factors, coefficients: coeff, pctDiff };
}

export function computeDaysOnMarket(firstSeenAt: string): number {
  const first = new Date(firstSeenAt);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - first.getTime()) / 86_400_000));
}

export function formatDaysOnMarket(days: number): string {
  if (days <= 3) return "Nieuw";
  if (days < 60) return `${days} dagen`;
  const months = Math.floor(days / 30);
  return `${months} maanden`;
}

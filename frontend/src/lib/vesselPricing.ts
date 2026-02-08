import { Vessel } from "@/lib/supabase";

export interface Coefficients {
  length: number;
  tonnage: number;
  build_year: number;
  intercept: number;
  r2: number;
  label: string;
}

// Types where the linear model fails catastrophically (MAPE > 90%)
const UNSUPPORTED_TYPES = new Set([
  "Duw/Sleepboot",
  "Woonschip",
  "Kraanschip",
  "Accomodatieschip",
  "Ponton",
  "Overige",
  "Passagiersschip",
]);

export type SuppressionReason = "unsupported_type" | "too_old" | "too_small";

/** Returns a reason string if prediction should be suppressed, null if OK */
export function shouldSuppressPrediction(vessel: Vessel): SuppressionReason | null {
  if (vessel.type && UNSUPPORTED_TYPES.has(vessel.type)) return "unsupported_type";
  if (vessel.build_year != null && vessel.build_year < 1950) return "too_old";
  if (vessel.length_m != null && vessel.length_m < 40) return "too_small";
  return null;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export function getConfidenceLevel(vessel: Vessel): ConfidenceLevel {
  const coeff = getCoefficients(vessel.type);
  if (coeff.r2 >= 0.8) return "high";
  if (coeff.r2 >= 0.5) return "medium";
  return "low";
}

// Retrained coefficients from model competition (2026-02-08)
// Linear fallback for frontend; Log-Price GBM (R²=0.744) is the primary model
export const TYPE_COEFFICIENTS: Record<string, Coefficients> = {
  Motorvrachtschip: {
    length: 24775.45,
    tonnage: 154.53,
    build_year: 20847.54,
    intercept: -42311494.51,
    r2: 0.837,
    label: "Motorvrachtschip",
  },
  Tankschip: {
    length: 6765.06,
    tonnage: 823.2,
    build_year: 20883.83,
    intercept: -41268543.44,
    r2: 0.625,
    label: "Tankschip",
  },
  Duwbak: {
    length: 11983.87,
    tonnage: -53.49,
    build_year: 8622.09,
    intercept: -17376364.25,
    r2: 0.398,
    label: "Duwbak",
  },
  _fallback: {
    length: 11599.98,
    tonnage: 319.29,
    build_year: 24807.53,
    intercept: -49121384.67,
    r2: 0.744,
    label: "Alle typen",
  },
};

const MIN_PRICE = 10_000;
const MAX_PRICE = 15_000_000;

export function getCoefficients(type: string | null | undefined): Coefficients {
  if (type && TYPE_COEFFICIENTS[type]) return TYPE_COEFFICIENTS[type];
  return TYPE_COEFFICIENTS._fallback;
}

export function predictPrice(vessel: Vessel): number | null {
  if (shouldSuppressPrediction(vessel)) return null;
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

export interface PriceRange {
  low: number;
  high: number;
  mid: number;
}

const RANGE_MARGIN = 0.20; // ±20% — conservative given ~31% MAPE

export function predictPriceRange(vessel: Vessel): PriceRange | null {
  const mid = predictPrice(vessel);
  if (mid === null) return null;

  const low = Math.max(MIN_PRICE, Math.round(mid * (1 - RANGE_MARGIN)));
  const high = Math.min(MAX_PRICE, Math.round(mid * (1 + RANGE_MARGIN)));

  return { low, high, mid };
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
  if (shouldSuppressPrediction(vessel)) return null;
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
      contribution: Math.round(coeff.build_year * (vessel.build_year - new Date().getFullYear())),
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

import { Vessel } from "@/lib/supabase";

export type SuppressionReason = "no_prediction";

/** Returns a reason string if prediction should be suppressed, null if OK */
export function shouldSuppressPrediction(vessel: Vessel): SuppressionReason | null {
  return vessel.predicted_price == null ? "no_prediction" : null;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export function getConfidenceLevel(vessel: Vessel): ConfidenceLevel {
  return vessel.prediction_confidence ?? "low";
}

export function predictPrice(vessel: Vessel): number | null {
  return vessel.predicted_price ?? null;
}

export interface PriceRange {
  low: number;
  high: number;
  mid: number;
}

export function predictPriceRange(vessel: Vessel): PriceRange | null {
  if (!vessel.prediction_range_low || !vessel.prediction_range_high) return null;
  return {
    low: vessel.prediction_range_low,
    high: vessel.prediction_range_high,
    mid: vessel.predicted_price ?? Math.round(
      (vessel.prediction_range_low + vessel.prediction_range_high) / 2,
    ),
  };
}

export interface PriceExplanationData {
  predicted: number;
  confidence: ConfidenceLevel;
  positiveFactors: string[];
  negativeFactors: string[];
  pctDiff: number | null;
}

export function explainPrice(vessel: Vessel): PriceExplanationData | null {
  const predicted = predictPrice(vessel);
  if (predicted === null) return null;

  const signals = vessel.condition_signals as Record<string, unknown> | null;
  const positiveFactors = (signals?.value_factors_positive as string[] | undefined) ?? [];
  const negativeFactors = (signals?.value_factors_negative as string[] | undefined) ?? [];

  let pctDiff: number | null = null;
  if (vessel.price != null && predicted > 0) {
    pctDiff = ((predicted - vessel.price) / predicted) * 100;
  }

  return {
    predicted,
    confidence: getConfidenceLevel(vessel),
    positiveFactors,
    negativeFactors,
    pctDiff,
  };
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

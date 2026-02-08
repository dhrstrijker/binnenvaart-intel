import { Vessel } from "@/lib/supabase";
import { predictPrice } from "@/lib/vesselPricing";

export interface DealScore {
  label: string;
  color: string;
  pctDiff: number;
}

export function computeDealScores(vessels: Vessel[]): Map<string, DealScore> {
  const scores = new Map<string, DealScore>();

  for (const v of vessels) {
    if (v.price == null) continue;

    const predicted = predictPrice(v);
    if (predicted == null || predicted <= 0) continue;

    const pctDiff = ((predicted - v.price) / predicted) * 100;
    let label: string;
    let color: string;

    if (pctDiff > 15) {
      label = "Scherp geprijsd";
      color = "bg-emerald-100 text-emerald-800";
    } else if (pctDiff >= -15) {
      label = "Marktconform";
      color = "bg-slate-100 text-slate-600";
    } else {
      label = "Boven marktgemiddelde";
      color = "bg-amber-100 text-amber-800";
    }

    scores.set(v.id, { label, color, pctDiff: Math.round(pctDiff) });
  }

  return scores;
}

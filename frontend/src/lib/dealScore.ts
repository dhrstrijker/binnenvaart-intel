import { Vessel } from "@/lib/supabase";

export interface DealScore {
  label: string;
  color: string;
  percentile: number;
}

export function computeDealScores(vessels: Vessel[]): Map<string, DealScore> {
  const scores = new Map<string, DealScore>();

  // Group vessels by type
  const byType = new Map<string, Vessel[]>();
  for (const v of vessels) {
    if (v.price == null || !v.type) continue;
    const group = byType.get(v.type);
    if (group) group.push(v);
    else byType.set(v.type, [v]);
  }

  for (const [, group] of byType) {
    // Only score types with 10+ priced vessels
    if (group.length < 10) continue;

    // Sort by price ascending
    const sorted = [...group].sort((a, b) => a.price! - b.price!);

    for (let i = 0; i < sorted.length; i++) {
      const percentile = (i / (sorted.length - 1)) * 100;
      let label: string;
      let color: string;

      if (percentile < 40) {
        label = "Scherp geprijsd";
        color = "bg-emerald-100 text-emerald-800";
      } else if (percentile <= 60) {
        label = "Marktconform";
        color = "bg-slate-100 text-slate-600";
      } else {
        label = "Boven marktgemiddelde";
        color = "bg-amber-100 text-amber-800";
      }

      scores.set(sorted[i].id, { label, color, percentile });
    }
  }

  return scores;
}

import { DealScore } from "@/lib/dealScore";

interface DealScoreBadgeProps {
  score: DealScore;
}

export default function DealScoreBadge({ score }: DealScoreBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${score.color}`}>
      {score.label}
    </span>
  );
}

import { Vessel } from "@/lib/supabase";
import { explainPrice, predictPriceRange, shouldSuppressPrediction, SuppressionReason } from "@/lib/vesselPricing";
import Link from "next/link";

interface PriceExplanationProps {
  vessel: Vessel;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

const SUPPRESSION_MESSAGES: Record<SuppressionReason, string> = {
  unsupported_type: "Geen prijsschatting beschikbaar voor dit scheepstype",
  too_old: "Geen betrouwbare schatting mogelijk voor schepen van vóór 1950",
  too_small: "Geen betrouwbare schatting mogelijk voor schepen onder 40 meter",
};

export default function PriceExplanation({ vessel }: PriceExplanationProps) {
  const suppressionReason = shouldSuppressPrediction(vessel);

  if (suppressionReason) {
    return (
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Marktwaarde-analyse</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Niet beschikbaar
          </span>
        </div>
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-sm text-slate-500">{SUPPRESSION_MESSAGES[suppressionReason]}</p>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Het prijsmodel werkt het beste voor vrachtschepen en tankschepen van 40m+ gebouwd na 1950.
        </p>
      </div>
    );
  }

  const data = explainPrice(vessel);
  const range = predictPriceRange(vessel);
  if (!data || !range) return null;

  const { factors, coefficients, pctDiff } = data;

  let confidenceLabel: string;
  let confidenceColor: string;
  if (coefficients.r2 >= 0.8) {
    confidenceLabel = "Hoge betrouwbaarheid";
    confidenceColor = "bg-emerald-100 text-emerald-800";
  } else if (coefficients.r2 >= 0.5) {
    confidenceLabel = "Gemiddelde betrouwbaarheid";
    confidenceColor = "bg-amber-100 text-amber-800";
  } else {
    confidenceLabel = "Indicatief";
    confidenceColor = "bg-slate-100 text-slate-600";
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Marktwaarde-analyse</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColor}`}>
          {confidenceLabel}
        </span>
      </div>

      {/* Price range */}
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
        <p className="text-xs text-slate-500">Geschatte prijsrange</p>
        <p className="text-xl font-extrabold text-slate-900">
          {formatEur(range.low)} – {formatEur(range.high)}
        </p>
        {pctDiff !== null && vessel.price !== null && (
          <p className={`mt-0.5 text-xs font-semibold ${pctDiff > 0 ? "text-emerald-600" : pctDiff < 0 ? "text-red-500" : "text-slate-500"}`}>
            {pctDiff > 0
              ? `Vraagprijs ${Math.round(Math.abs(pctDiff))}% onder marktgemiddelde`
              : pctDiff < 0
                ? `Vraagprijs ${Math.round(Math.abs(pctDiff))}% boven marktgemiddelde`
                : "Vraagprijs rond marktgemiddelde"}
          </p>
        )}
      </div>

      {/* Factor breakdown */}
      <div className="mt-3">
        <p className="text-xs font-medium text-slate-500">Prijsbepalende factoren</p>
        <ul className="mt-1.5 space-y-1">
          {factors.map((f) => (
            <li key={f.label} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
                {f.label} ({f.rawValue})
              </span>
              <span className={`font-medium ${f.contribution >= 0 ? "text-slate-900" : "text-red-500"}`}>
                {f.contribution >= 0 ? "+" : ""}{formatEur(f.contribution)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Disclaimer */}
      <p className="mt-3 text-xs text-slate-400">
        Indicatie op basis van vergelijkbare {coefficients.label.toLowerCase()}. Geen taxatie.
      </p>

      {/* Premium CTA */}
      <div className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-2.5">
        <p className="text-xs font-medium text-slate-700">Uitgebreide marktanalyse nodig?</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Ontvang een compleet rapport met vergelijkbare transacties en markttrends.
        </p>
        <Link
          href="/pricing"
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 hover:text-cyan-800 transition-colors"
        >
          Bekijk analyse-abonnementen
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

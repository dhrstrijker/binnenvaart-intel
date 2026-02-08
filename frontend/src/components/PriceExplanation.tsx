import { Vessel } from "@/lib/supabase";
import { explainPrice, predictPriceRange, shouldSuppressPrediction } from "@/lib/vesselPricing";
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
          <p className="text-sm text-slate-500">Geen prijsschatting beschikbaar voor dit schip</p>
        </div>
      </div>
    );
  }

  const data = explainPrice(vessel);
  const range = predictPriceRange(vessel);
  if (!data || !range) return null;

  const { confidence, positiveFactors, negativeFactors, pctDiff } = data;

  let confidenceLabel: string;
  let confidenceColor: string;
  if (confidence === "high") {
    confidenceLabel = "Hoge betrouwbaarheid";
    confidenceColor = "bg-emerald-100 text-emerald-800";
  } else if (confidence === "medium") {
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

      {/* Value factors */}
      {(positiveFactors.length > 0 || negativeFactors.length > 0) && (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-500">Waardebepalende factoren</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {positiveFactors.map((f) => (
              <span key={f} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                {f}
              </span>
            ))}
            {negativeFactors.map((f) => (
              <span key={f} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-3 text-xs text-slate-400">
        Indicatie op basis van vergelijkbare schepen. Geen taxatie.
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

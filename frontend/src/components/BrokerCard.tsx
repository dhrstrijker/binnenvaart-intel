import { Vessel } from "@/lib/supabase";
import { sourceLabel, sourceColor, safeUrl } from "@/lib/sources";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface BrokerCardProps {
  vessel: Vessel;
}

export default function BrokerCard({ vessel }: BrokerCardProps) {
  const multiSource =
    vessel.linked_sources && vessel.linked_sources.length >= 2;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      {/* Primary broker */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${sourceColor(vessel.source)}`}
        >
          {sourceLabel(vessel.source)}
        </span>
      </div>

      {/* CTA button */}
      <a
        href={safeUrl(vessel.url)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-700"
      >
        Bekijk bij {sourceLabel(vessel.source)}
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 5l7 7m0 0l-7 7m7-7H3"
          />
        </svg>
      </a>

      {/* Other sources */}
      {multiSource && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-500">
            Ook beschikbaar bij:
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {vessel.linked_sources!
              .filter((ls) => ls.source !== vessel.source)
              .map((ls) => (
                <a
                  key={ls.vessel_id}
                  href={safeUrl(ls.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${sourceColor(ls.source)}`}
                  >
                    {sourceLabel(ls.source)}
                  </span>
                  <svg
                    className="ml-auto h-3 w-3 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Source since */}
      <p className="mt-4 text-xs text-slate-400">
        Bron sinds {formatDate(vessel.first_seen_at)}
      </p>
    </div>
  );
}

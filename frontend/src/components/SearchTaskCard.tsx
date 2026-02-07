"use client";

import { SavedSearch, getFilterPills, FREQUENCY_LABELS } from "@/lib/savedSearchTypes";

interface SearchTaskCardProps {
  search: SavedSearch;
  matchCount: number | null;
  onEdit: (search: SavedSearch) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

export default function SearchTaskCard({
  search,
  matchCount,
  onEdit,
  onDelete,
  onToggleActive,
}: SearchTaskCardProps) {
  const pills = getFilterPills(search.filters);

  return (
    <div
      className={`rounded-xl bg-white shadow-md ring-1 ring-gray-100 transition ${
        !search.active ? "opacity-60" : ""
      }`}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-900">
              {search.name}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {!search.active && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                Gepauzeerd
              </span>
            )}
            <button
              onClick={() => onToggleActive(search.id, !search.active)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
                search.active ? "bg-cyan-500" : "bg-slate-300"
              }`}
              role="switch"
              aria-checked={search.active}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  search.active ? "translate-x-4" : "translate-x-0.5"
                } mt-0.5`}
              />
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pills.length > 0 ? (
            pills.map((pill, i) => (
              <span
                key={i}
                className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-medium text-cyan-700"
              >
                {pill.label}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400">Alle schepen</span>
          )}
        </div>

        {/* Match count + frequency */}
        <div className="mt-3 flex items-center gap-3">
          {matchCount !== null && (
            <span className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{matchCount}</span>{" "}
              {matchCount === 1 ? "schip matcht" : "schepen matchen"} nu
            </span>
          )}
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
            {FREQUENCY_LABELS[search.frequency] ?? search.frequency}
          </span>
        </div>
      </div>

      {/* Actions footer */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
        <button
          onClick={() => onEdit(search)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Bewerken
        </button>
        <button
          onClick={() => onDelete(search.id)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
        >
          Verwijderen
        </button>
      </div>
    </div>
  );
}

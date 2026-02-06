export const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  rensendriessen: { label: "Rensen & Driessen", color: "bg-sky-100 text-sky-800" },
  galle: { label: "Galle Makelaars", color: "bg-amber-100 text-amber-800" },
  pcshipbrokers: { label: "PC Shipbrokers", color: "bg-emerald-100 text-emerald-800" },
  gtsschepen: { label: "GTS Schepen", color: "bg-violet-100 text-violet-800" },
};

export function sourceLabel(source: string): string {
  return SOURCE_CONFIG[source]?.label ?? source;
}

export function sourceColor(source: string): string {
  return SOURCE_CONFIG[source]?.color ?? "bg-gray-100 text-gray-800";
}

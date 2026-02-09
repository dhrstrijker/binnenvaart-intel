export const SOURCES = [
  { value: "", label: "Alle bronnen" },
  { value: "rensendriessen", label: "Rensen & Driessen" },
  { value: "galle", label: "Galle" },
  { value: "pcshipbrokers", label: "PC Shipbrokers" },
  { value: "gtsschepen", label: "GTS" },
  { value: "gsk", label: "GSK" },
];

export const PREFERRED_TYPES = ["Motorvrachtschip", "Tankschip", "Beunschip"];
export const MAX_VISIBLE_TYPES = 3;

export const PRICE_CFG = { min: 0, max: 5_000_000, step: 25_000 };
export const LENGTH_CFG = { min: 0, max: 200, step: 1 };

export const PRICE_PRESETS = [
  { label: "Alle prijzen", min: 0, max: 5_000_000 },
  { label: "< €250K", min: 0, max: 250_000 },
  { label: "€250K – €500K", min: 250_000, max: 500_000 },
  { label: "€500K – €1M", min: 500_000, max: 1_000_000 },
  { label: "> €1M", min: 1_000_000, max: 5_000_000 },
];

export const LENGTH_PRESETS = [
  { label: "Alle lengtes", min: 0, max: 200 },
  { label: "< 50m", min: 0, max: 50 },
  { label: "50 – 80m", min: 50, max: 80 },
  { label: "80 – 110m", min: 80, max: 110 },
  { label: "> 110m", min: 110, max: 200 },
];

export function fmtPriceFull(v: number): string {
  return `€ ${v.toLocaleString("nl-NL")}`;
}

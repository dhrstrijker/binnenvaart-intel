export interface SourceInfo {
  label: string;
  color: string;
  phone?: string;
  email?: string;
}

export const SOURCE_CONFIG: Record<string, SourceInfo> = {
  rensendriessen: { label: "Rensen & Driessen", color: "bg-sky-100 text-sky-800", phone: "+31786191233", email: "verkooprdsb@rensendriessen.com" },
  galle: { label: "Galle Makelaars", color: "bg-amber-100 text-amber-800", phone: "+31183507040", email: "info@gallemakelaars.nl" },
  pcshipbrokers: { label: "PC Shipbrokers", color: "bg-emerald-100 text-emerald-800", phone: "+31858883583", email: "info@pcshipbrokers.com" },
  gtsschepen: { label: "GTS Schepen", color: "bg-violet-100 text-violet-800", phone: "+31651439545", email: "maarten@gtsschepen.nl" },
  gsk: { label: "GSK Brokers", color: "bg-rose-100 text-rose-800", phone: "+32475274767", email: "gsk@gskbrokers.eu" },
};

export function sourceLabel(source: string): string {
  return SOURCE_CONFIG[source]?.label ?? source;
}

export function sourceColor(source: string): string {
  return SOURCE_CONFIG[source]?.color ?? "bg-gray-100 text-gray-800";
}

export function sourcePhone(source: string): string | undefined {
  return SOURCE_CONFIG[source]?.phone;
}

export function sourceEmail(source: string): string | undefined {
  return SOURCE_CONFIG[source]?.email;
}

/** Format a tel: string like "+31786191233" to a readable display format. */
export function formatPhoneDisplay(tel: string): string {
  // Belgian numbers (+32)
  if (tel.startsWith("+32")) {
    const rest = tel.slice(3);
    return `+32 ${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7)}`.trim();
  }
  // Dutch mobile (+316...)
  if (tel.startsWith("+316")) {
    const rest = tel.slice(3);
    return `+31 ${rest.slice(0, 1)} ${rest.slice(1, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`.trim();
  }
  // Dutch landline
  if (tel.startsWith("+31")) {
    const rest = tel.slice(3);
    if (rest.length === 9) {
      return `+31 (0)${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`.trim();
    }
    return `+31 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`.trim();
  }
  return tel;
}

/** Validate URL protocol — block javascript: and other dangerous schemes. */
export function safeUrl(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const u = new URL(url, "https://placeholder.invalid");
    if (u.protocol !== "https:" && u.protocol !== "http:") return "#";
  } catch {
    return "#";
  }
  return url;
}

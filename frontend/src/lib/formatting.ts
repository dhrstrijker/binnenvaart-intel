/** Format a price in EUR with Dutch locale. Returns "Prijs op aanvraag" for null. */
export function formatPrice(price: number | null): string {
  if (price === null) return "Prijs op aanvraag";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/** Format a price as a short string: €100k, €1,5M */
export function formatPriceShort(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = millions % 1 === 0 ? `${millions}` : `${millions.toFixed(1).replace(".", ",")}`;
    return `€${formatted}M`;
  }
  if (value >= 1_000) {
    return `€${Math.round(value / 1_000)}K`;
  }
  return `€${value}`;
}

/** Format an ISO date string as a full Dutch date (e.g. "3 januari 2025"). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Format an ISO date string as a short Dutch date (e.g. "3 jan"). */
export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

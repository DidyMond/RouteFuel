const decimal = (digits: number) =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatters = { 0: decimal(0), 1: decimal(1), 2: decimal(2), 3: decimal(3) } as const;

/** Prezzo al litro, es. "1,862". */
export const formatPrice = (value: number) => formatters[3].format(value);

/** Importo in euro, es. "€ 12,31". */
export const formatEuro = (value: number) => `€ ${formatters[2].format(Math.abs(value))}`;

export const formatKm = (value: number) => `${formatters[1].format(value)} km`;

export function formatDetourMinutes(minutes: number): string {
  return minutes < 1 ? "<1 min" : `${formatters[0].format(minutes)} min`;
}

/** Durata complessiva, es. "2 h 33 min". */
export function formatDuration(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/** Durata compatta per la capsula sulla mappa, es. "2h 39m". */
export function formatDurationCompact(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Data e ora locali, es. "28 set 2026, 21:13". */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** Solo giorno e mese, es. "27 set". */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(iso));
}

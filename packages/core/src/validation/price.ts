/**
 * Range di prezzo plausibile per un litro di carburante in Italia (€).
 * Serve solo a intercettare errori di battitura/parsing grossolani
 * (es. "26.69" invece di "2.669"), non a validare la congruità di mercato.
 */
const MIN_PLAUSIBLE_PRICE = 0.3;
const MAX_PLAUSIBLE_PRICE = 5;

export function isPlausiblePrice(price: number): boolean {
  return Number.isFinite(price) && price >= MIN_PLAUSIBLE_PRICE && price <= MAX_PLAUSIBLE_PRICE;
}

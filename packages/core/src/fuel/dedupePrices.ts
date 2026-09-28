import type { FuelPrice } from "@routefuel/shared";

/**
 * Raggruppare le varianti brandizzate sotto il tipo carburante base (vedi
 * normalizeFuelType) può far coesistere, per la stessa stazione e modalità,
 * più righe con lo stesso (stationId, fuelType, isSelf) — es. "Gasolio" e
 * "Gasolio Premium" nella stessa stazione mappano entrambe su "diesel".
 *
 * Regola di riduzione entro un singolo batch di ingestione: si tiene il
 * prezzo più basso (il prodotto "generico" che un utente che seleziona
 * genericamente "Diesel" si aspetterebbe), con pareggio risolto sul dtComu
 * più recente. Non rappresenta uno storico: ogni ingestione sostituisce
 * comunque il valore precedente in DB con quello osservato oggi.
 */
export function dedupeToLowestPricePerStationFuelMode(prices: FuelPrice[]): FuelPrice[] {
  const bestByKey = new Map<string, FuelPrice>();

  for (const price of prices) {
    const key = `${price.stationId}|${price.fuelType}|${price.isSelf}`;
    const current = bestByKey.get(key);

    if (!current || isBetterPrice(price, current)) {
      bestByKey.set(key, price);
    }
  }

  return [...bestByKey.values()];
}

function isBetterPrice(candidate: FuelPrice, current: FuelPrice): boolean {
  if (candidate.price !== current.price) {
    return candidate.price < current.price;
  }
  return candidate.communicatedAt > current.communicatedAt;
}

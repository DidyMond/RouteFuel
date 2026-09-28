/**
 * Deviazione = extra reale di A→stazione→B rispetto ad A→B (stessa definizione
 * del D_detour/T_detour della formula S_net e dello slider `maxDetourKm`).
 */

/**
 * Rapporto tipico tra distanza su strada e distanza in linea d'aria per
 * percorsi extraurbani. Ipotesi documentata, non un dato misurato: serve solo
 * al ranking iniziale, poi sostituita dal routing reale per la top-N.
 */
export const PROXY_CIRCUITY_FACTOR = 1.25;

/** Velocità media assunta sul tratto di deviazione (strade locali), km/h. */
export const PROXY_DETOUR_SPEED_KMH = 40;

export interface Detour {
  km: number;
  minutes: number;
}

/**
 * Stima proxy: si esce dal tracciato nel punto più vicino, si raggiunge la
 * stazione e si rientra nello stesso punto (andata e ritorno = 2 × distanza
 * laterale), corretta per la tortuosità stradale.
 */
export function estimateProxyDetour(lateralDistanceKm: number): Detour {
  if (!Number.isFinite(lateralDistanceKm) || lateralDistanceKm < 0) {
    throw new RangeError(`lateralDistanceKm deve essere >= 0 (ricevuto ${lateralDistanceKm})`);
  }
  const km = 2 * lateralDistanceKm * PROXY_CIRCUITY_FACTOR;
  return { km, minutes: (km / PROXY_DETOUR_SPEED_KMH) * 60 };
}

export interface RouteMetrics {
  distanceKm: number;
  durationMinutes: number;
}

/**
 * Deviazione reale da due risposte di routing. Il risultato non scende mai
 * sotto zero: piccole differenze di snapping/percorso possono far risultare
 * A→S→B marginalmente più corto di A→B, ma una deviazione negativa non ha
 * significato fisico.
 */
export function computeRoutedDetour(direct: RouteMetrics, viaStation: RouteMetrics): Detour {
  return {
    km: Math.max(0, viaStation.distanceKm - direct.distanceKm),
    minutes: Math.max(0, viaStation.durationMinutes - direct.durationMinutes),
  };
}

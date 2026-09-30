/**
 * Stile della mappa. Il default è il basemap Mapbox Standard con tema ad alta leggibilità; chi vuole sostituirlo
 * (es. lo stile di brand disegnato in Mapbox Studio) imposta VITE_MAPBOX_STYLE_URL in apps/web/.env senza toccare
 * il codice. Niente stili creati via Styles API: lo stile di brand si disegna a mano in Studio (Milestone 7).
 */

export const DEFAULT_STYLE_URL = "mapbox://styles/mapbox/standard";

/** Lingua delle etichette: Standard non ha una config `language`, si usa l'opzione `language` di Map (GL JS ≥ 3.10). */
export const MAP_LANGUAGE = "it";

/**
 * Tema del basemap Standard: `monochrome` (grigi neutri). Motivazione in docs/PLAN.md (M2, revisione funzionale):
 * i nostri overlay sono blu #0284C7 (rotta diretta) e verde #059669 (rotta con sosta, pin «Migliore»); con il tema
 * monocromatico lo sfondo non contiene altri colori saturi (nessun verde dei parchi né azzurro dell'acqua) e i due
 * colori restano sempre distinguibili. `faded` mantiene verde e azzurro desaturati che competono con gli overlay.
 */
export const STANDARD_THEME = "monochrome";

/** Config del basemap Standard: solo ciò che serve a una mappa leggibile sotto i nostri pin (niente POI, niente 3D). */
export const STANDARD_CONFIG = {
  basemap: {
    theme: STANDARD_THEME,
    lightPreset: "day",
    showPointOfInterestLabels: false,
    showTransitLabels: false,
    show3dObjects: false,
    showPedestrianRoads: false,
  },
} as const;

export interface ResolvedMapStyle {
  url: string;
  /** true se si usa il basemap Standard di default: solo lì valgono `config` e gli `slot` dei livelli. */
  isStandard: boolean;
}

const MAPBOX_STYLE_URL = /^mapbox:\/\/styles\/[\w.-]+\/[\w.-]+$/;

/** Usa lo stile indicato in VITE_MAPBOX_STYLE_URL se è un URL `mapbox://styles/...` valido, altrimenti il default. */
export function resolveMapStyle(envValue: string | undefined): ResolvedMapStyle {
  const custom = envValue?.trim();
  if (custom && MAPBOX_STYLE_URL.test(custom)) {
    return { url: custom, isStandard: custom === DEFAULT_STYLE_URL };
  }
  return { url: DEFAULT_STYLE_URL, isStandard: true };
}

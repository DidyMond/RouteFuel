import type { GeocodeSuggestion, LonLat } from "@routefuel/shared";
import { useEffect, useState } from "react";
import { autocompleteAddress } from "../lib/api";
import { useDebouncedValue } from "./useDebouncedValue";

/** Debounce e soglia minima confermati in docs/PLAN.md: riducono costi e dati inviati a terzi. */
export const AUTOCOMPLETE_DEBOUNCE_MS = 350;
export const AUTOCOMPLETE_MIN_CHARS = 3;

interface State {
  suggestions: GeocodeSuggestion[];
  loading: boolean;
  error: boolean;
}

const EMPTY: State = { suggestions: [], loading: false, error: false };

/**
 * @param query testo digitato
 * @param enabled false quando non serve cercare (campo non attivo o luogo già scelto)
 */
export function useAddressAutocomplete(query: string, enabled: boolean, proximity?: LonLat): State {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, AUTOCOMPLETE_DEBOUNCE_MS);
  const [state, setState] = useState<State>(EMPTY);

  const proximityLon = proximity?.lon;
  const proximityLat = proximity?.lat;

  useEffect(() => {
    if (!enabled || debounced.length < AUTOCOMPLETE_MIN_CHARS) {
      setState(EMPTY);
      return;
    }

    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: false }));

    const near = proximityLon !== undefined && proximityLat !== undefined ? { lon: proximityLon, lat: proximityLat } : undefined;
    autocompleteAddress(debounced, near, controller.signal)
      .then((suggestions) => setState({ suggestions, loading: false, error: false }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ suggestions: [], loading: false, error: true });
      });

    return () => controller.abort();
  }, [debounced, enabled, proximityLon, proximityLat]);

  // Finché il testo attuale è sotto soglia (o non è ancora passato il debounce) non si mostrano suggerimenti vecchi.
  const belowThreshold = trimmed.length < AUTOCOMPLETE_MIN_CHARS;
  return belowThreshold || !enabled ? EMPTY : state;
}

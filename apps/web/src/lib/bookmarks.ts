/**
 * Stazioni salvate («Salva per il ritorno»), solo in `localStorage` del browser: nessun dato lascia il dispositivo.
 * Si conserva il minimo per riconoscerle e riaprirle in futuro (nome, località, coordinate) e la data di salvataggio.
 * Ogni lettura/scrittura è protetta: in navigazione privata o con i dati del sito bloccati lo storage può essere
 * assente o lanciare, e l'app deve funzionare comunque (il segnalibro vale allora solo per la sessione).
 */
export interface SavedStation {
  id: number;
  nomeImpianto: string;
  comune: string;
  lat: number;
  lon: number;
  /** ISO 8601. */
  savedAt: string;
}

export const BOOKMARKS_KEY = "routefuel.savedStations.v1";

function isSavedStation(value: unknown): value is SavedStation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    typeof v.nomeImpianto === "string" &&
    typeof v.comune === "string" &&
    typeof v.lat === "number" &&
    typeof v.lon === "number" &&
    typeof v.savedAt === "string"
  );
}

/** Copia in memoria: vale quando lo storage non è disponibile. */
let memory: SavedStation[] = [];

export function readSavedStations(): SavedStation[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (raw === null) return [...memory];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedStation) : [];
  } catch {
    return [...memory];
  }
}

function write(list: SavedStation[]): void {
  memory = list;
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
  } catch {
    // storage pieno o bloccato: resta la copia in memoria
  }
}

export function isStationSaved(id: number): boolean {
  return readSavedStations().some((s) => s.id === id);
}

/** Salva o rimuove la stazione; restituisce lo stato dopo l'operazione (true = salvata). */
export function toggleSavedStation(station: Omit<SavedStation, "savedAt">, now: () => Date = () => new Date()): boolean {
  const list = readSavedStations();
  if (list.some((s) => s.id === station.id)) {
    write(list.filter((s) => s.id !== station.id));
    return false;
  }
  write([...list, { ...station, savedAt: now().toISOString() }]);
  return true;
}

/** Solo per i test: azzera la copia in memoria. */
export function resetBookmarkMemory(): void {
  memory = [];
}

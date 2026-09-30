import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import { pickVisibleMarkers } from "../../lib/declutter";
import { getMapStyle } from "../../lib/env";
import { MAP_LANGUAGE, STANDARD_CONFIG } from "../../lib/mapStyle";
import { MinusIcon, PlusIcon, LocateIcon } from "../icons";

export interface MapStation {
  id: number;
  lon: number;
  lat: number;
  /** Testo del prezzo nella pill, es. "€1,689". */
  priceLabel: string;
  /** Descrizione per lettori di schermo. */
  ariaLabel: string;
  best: boolean;
}

export interface MapCanvasProps {
  token: string;
  /** Tracciato [lon, lat]. */
  geometry: ReadonlyArray<[number, number]>;
  /** Stazioni in ordine di priorità (la prima ha la precedenza quando i pin si sovrappongono). */
  stations: readonly MapStation[];
  selectedId: number | null;
  /** Percorso A→stazione→B della stazione selezionata (verde, sopra la rotta diretta); null = non disegnarlo. */
  stopRoute: ReadonlyArray<[number, number]> | null;
  onSelectStation: (id: number) => void;
  /** Tap sullo sfondo della mappa: deseleziona la stazione. */
  onDeselect: () => void;
  /** Motivo per cui la mappa non può essere mostrata (token non valido, WebGL assente…). */
  onUnavailable: (reason: string) => void;
}

// Colori dei token di DESIGN.md (secondary, secondary-container, primary, error): Mapbox li vuole come stringhe, non come classi.
const ROUTE_COLOR = "#0284C7";
const STOP_ROUTE_COLOR = "#059669";
const ROUTE_DASH_COLOR = "#5bb8fe";
const END_COLOR = "#ba1a1a";
const PIN_SIZE = { width: 72, height: 34 } as const;
const FIT_PADDING = { top: 72, bottom: 28, left: 28, right: 64 } as const;

const PIN_BASE = "flex items-center gap-1 px-2.5 py-1 rounded-full font-label-md text-label-md font-bold leading-none tabular-nums whitespace-nowrap";
const PIN_BEST = `${PIN_BASE} bg-primary text-on-primary shadow-lg ring-2 ring-primary-fixed/50`;
const PIN_OTHER = `${PIN_BASE} bg-surface-container-lowest text-on-surface shadow-md border border-outline-variant/40`;
const PIN_SELECTED = "ring-2 ring-secondary scale-110";

const VERIFIED_SVG =
  '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.4 1.7 2.9-.1 1 2.7 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.7-2.9-.1L12 21l-2.4-1.7-2.9.1-1-2.7L3.3 15l.9-2.8-.9-2.8 2.4-1.7 1-2.7 2.9.1z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>';

interface PinEntry {
  marker: mapboxgl.Marker;
  element: HTMLButtonElement;
  station: MapStation;
}

function buildPin(station: MapStation, selected: boolean): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", station.ariaLabel);
  element.className = "flex flex-col items-center transition-transform active:scale-95";

  const pill = document.createElement("span");
  pill.className = `${station.best ? PIN_BEST : PIN_OTHER} ${selected ? PIN_SELECTED : ""}`;
  if (station.best) pill.insertAdjacentHTML("beforeend", VERIFIED_SVG);
  const price = document.createElement("span");
  price.textContent = station.priceLabel;
  pill.appendChild(price);

  const tail = document.createElement("span");
  tail.className = `block w-2 h-2 -mt-1 rotate-45 ${station.best ? "bg-primary" : "bg-surface-container-lowest border-r border-b border-outline-variant/40"}`;

  element.append(pill, tail);
  return element;
}

function buildEndpoint(color: string): HTMLDivElement {
  const dot = document.createElement("div");
  dot.style.cssText = `width:14px;height:14px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.35)`;
  return dot;
}

function routeBounds(geometry: ReadonlyArray<[number, number]>): mapboxgl.LngLatBounds {
  const bounds = new mapboxgl.LngLatBounds();
  for (const point of geometry) bounds.extend(point);
  return bounds;
}

export default function MapCanvas({
  token,
  geometry,
  stations,
  selectedId,
  stopRoute,
  onSelectStation,
  onDeselect,
  onUnavailable,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pinsRef = useRef<Map<number, PinEntry>>(new Map());
  const endpointsRef = useRef<mapboxgl.Marker[]>([]);
  const loadedRef = useRef(false);

  // I valori più recenti servono ai listener registrati una volta sola.
  const latest = useRef({ geometry, stations, selectedId, stopRoute, onSelectStation, onDeselect, onUnavailable });
  latest.current = { geometry, stations, selectedId, stopRoute, onSelectStation, onDeselect, onUnavailable };

  /**
   * Crea solo i pin che restano visibili dopo l'anti-sovrapposizione e rimuove gli altri: con decine di stazioni
   * lungo il percorso ne servono pochi alla volta, e meno nodi DOM significa meno lavoro a ogni pan/zoom.
   */
  const syncPins = () => {
    const map = mapRef.current;
    if (!map) return;
    const { stations: list, selectedId: selected } = latest.current;
    const byId = new Map(list.map((station) => [station.id, station]));
    const rank = new Map(list.map((station, index) => [station.id, index]));
    const ordered = [...list].sort((a, b) => Number(b.id === selected) - Number(a.id === selected) || Number(b.best) - Number(a.best));
    const size = map.getContainer().getBoundingClientRect();
    const positions = ordered.map((station) => {
      const point = map.project([station.lon, station.lat]);
      return { id: station.id, x: point.x, y: point.y };
    });
    const visible = pickVisibleMarkers(positions, { ...PIN_SIZE, viewport: { width: size.width, height: size.height } });
    const pins = pinsRef.current;

    for (const [id, entry] of pins) {
      const station = byId.get(id);
      const changed =
        !station ||
        station.priceLabel !== entry.station.priceLabel ||
        station.best !== entry.station.best ||
        station.ariaLabel !== entry.station.ariaLabel;
      if (!visible.has(id) || changed) {
        entry.marker.remove();
        pins.delete(id);
      }
    }

    for (const id of visible) {
      const station = byId.get(id)!;
      const isSelected = id === selected;
      let entry = pins.get(id);
      if (!entry) {
        const element = buildPin(station, isSelected);
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          latest.current.onSelectStation(id);
        });
        const marker = new mapboxgl.Marker({ element, anchor: "bottom" }).setLngLat([station.lon, station.lat]).addTo(map);
        // Mapbox marca i marker con role="img", non ammesso su un <button>.
        element.setAttribute("role", "button");
        entry = { marker, element, station };
        pins.set(id, entry);
      } else {
        const pill = entry.element.firstElementChild as HTMLElement;
        PIN_SELECTED.split(" ").forEach((cls) => pill.classList.toggle(cls, isSelected));
      }
      entry.station = station;
      // Sopra gli altri: prima la selezionata, poi la migliore, poi in ordine di priorità.
      entry.element.style.zIndex = String(isSelected ? 1000 : station.best ? 900 : list.length - (rank.get(id) ?? 0));
    }
  };

  const fitRoute = (animate: boolean) => {
    const map = mapRef.current;
    const { geometry: line } = latest.current;
    if (!map || line.length === 0) return;
    map.fitBounds(routeBounds(line), { padding: FIT_PADDING, duration: animate ? 600 : 0, maxZoom: 15 });
  };

  // Creazione della mappa (una volta).
  useEffect(() => {
    if (!containerRef.current) return;
    let map: mapboxgl.Map;
    const style = getMapStyle();
    try {
      mapboxgl.accessToken = token;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: style.url,
        // Tema e opzioni valgono solo per il basemap Standard; uno stile personalizzato (VITE_MAPBOX_STYLE_URL) ha le sue.
        ...(style.isStandard ? { config: STANDARD_CONFIG } : {}),
        language: MAP_LANGUAGE,
        bounds: latest.current.geometry.length > 0 ? routeBounds(latest.current.geometry) : undefined,
        fitBoundsOptions: { padding: FIT_PADDING, maxZoom: 15 },
        attributionControl: true,
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: false,
      });
    } catch {
      latest.current.onUnavailable("Il browser non supporta la grafica (WebGL) necessaria alla mappa.");
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();

    map.on("error", (event) => {
      const status = (event.error as { status?: number } | undefined)?.status;
      if (status === 401 || status === 403) {
        latest.current.onUnavailable(
          "Il token Mapbox non è valido o non è autorizzato per questo indirizzo: controlla la restrizione URL del token.",
        );
      }
    });

    // Nel basemap Standard i livelli propri si inseriscono nello slot "middle": sopra le strade, sotto le etichette.
    const slot = style.isStandard ? ({ slot: "middle" } as const) : {};

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource("route", { type: "geojson", data: lineData(latest.current.geometry) });
      map.addSource("stop-route", { type: "geojson", data: lineData(latest.current.stopRoute ?? []) });
      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route",
        ...slot,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-opacity": 0.22, "line-width": 14, "line-blur": 2 },
      });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        ...slot,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        ...slot,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 5 },
      });
      map.addLayer({
        id: "route-direction",
        type: "line",
        source: "route",
        ...slot,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_DASH_COLOR, "line-width": 2, "line-dasharray": [1.5, 2.5] },
      });
      // Percorso con sosta: sopra la rotta diretta, che resta azzurra dove i due tracciati divergono.
      map.addLayer({
        id: "stop-route-casing",
        type: "line",
        source: "stop-route",
        ...slot,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "stop-route-line",
        type: "line",
        source: "stop-route",
        ...slot,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": STOP_ROUTE_COLOR, "line-width": 4.5 },
      });
      syncEndpoints();
      // Il contenitore può avere altezza 0 alla creazione: si inquadra il percorso quando la dimensione è nota.
      map.resize();
      fitRoute(false);
      syncPins();
    });

    // I pin sono elementi DOM che fermano la propagazione: qui arrivano solo i tap sullo sfondo.
    map.on("click", () => latest.current.onDeselect());
    map.on("moveend", syncPins);
    map.on("zoomend", syncPins);

    let fittedAfterResize = false;
    const observer = new ResizeObserver((entries) => {
      map.resize();
      const box = entries[0]?.contentRect;
      if (!fittedAfterResize && box && box.width > 0 && box.height > 0) {
        fittedAfterResize = true;
        fitRoute(false);
      }
      syncPins();
    });
    observer.observe(containerRef.current);

    const pins = pinsRef.current;
    return () => {
      observer.disconnect();
      for (const { marker } of pins.values()) marker.remove();
      pins.clear();
      for (const marker of endpointsRef.current) marker.remove();
      endpointsRef.current = [];
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la mappa si crea una sola volta per token.
  }, [token]);

  function syncEndpoints() {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of endpointsRef.current) marker.remove();
    endpointsRef.current = [];
    const line = latest.current.geometry;
    if (line.length < 2) return;
    endpointsRef.current = [
      new mapboxgl.Marker({ element: buildEndpoint(ROUTE_COLOR) }).setLngLat(line[0]!).addTo(map),
      new mapboxgl.Marker({ element: buildEndpoint(END_COLOR) }).setLngLat(line[line.length - 1]!).addTo(map),
    ];
  }

  // Nuovo tracciato (nuova ricerca).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("route") as mapboxgl.GeoJSONSource | undefined)?.setData(lineData(geometry));
    syncEndpoints();
    fitRoute(false);
  }, [geometry]);

  // Percorso con sosta della stazione selezionata.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("stop-route") as mapboxgl.GeoJSONSource | undefined)?.setData(lineData(stopRoute ?? []));
  }, [stopRoute]);

  // Pin delle stazioni: si riconciliano a ogni cambio di filtri o di selezione.
  useEffect(() => {
    syncPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncPins legge i valori più recenti da `latest`.
  }, [stations, selectedId]);

  // Selezionare una stazione (dalla lista o da un pin) la porta in vista.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedId === null) return;
    const station = latest.current.stations.find((s) => s.id === selectedId);
    if (!station) return;
    map.easeTo({ center: [station.lon, station.lat], zoom: Math.max(map.getZoom(), 12), duration: 500 });
  }, [selectedId]);

  const controlClass =
    "w-11 h-11 rounded-full bg-surface-container-lowest/90 backdrop-blur-md shadow-md border border-outline-variant/40 flex items-center justify-center text-secondary hover:border-primary transition-colors active:scale-95";

  return (
    <div className="absolute inset-0">
      {/* Non "absolute": il CSS di Mapbox imposta position:relative sul contenitore e vincerebbe sulla classe. */}
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute right-4 bottom-4 z-10 flex flex-col items-center gap-space-sm">
        <button type="button" aria-label="Ingrandisci" className={controlClass} onClick={() => mapRef.current?.zoomIn()}>
          <PlusIcon />
        </button>
        <button type="button" aria-label="Riduci" className={controlClass} onClick={() => mapRef.current?.zoomOut()}>
          <MinusIcon />
        </button>
        <button type="button" aria-label="Ricentra il percorso" className={controlClass} onClick={() => fitRoute(true)}>
          <LocateIcon />
        </button>
      </div>
    </div>
  );
}

function lineData(geometry: ReadonlyArray<[number, number]>) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: geometry.map(([lon, lat]) => [lon, lat]) },
  };
}

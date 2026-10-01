import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mapbox GL richiede WebGL (assente in jsdom): si usa una mappa finta che registra le chiamate.
const fake = vi.hoisted(() => {
  const state = {
    maps: [] as Array<{
      resize: ReturnType<typeof vi.fn>;
      fitBounds: ReturnType<typeof vi.fn>;
      easeTo: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      handlers: Record<string, () => void>;
    }>,
    boundsPoints: [] as Array<Array<[number, number]>>,
    observerCallbacks: [] as Array<(entries: Array<{ contentRect: { width: number; height: number } }>) => void>,
  };

  class FakeBounds {
    points: Array<[number, number]> = [];
    constructor() {
      state.boundsPoints.push(this.points);
    }
    extend(point: [number, number]) {
      this.points.push(point);
      return this;
    }
  }

  class FakeMap {
    resize = vi.fn();
    fitBounds = vi.fn();
    easeTo = vi.fn();
    remove = vi.fn();
    handlers: Record<string, () => void> = {};
    touchZoomRotate = { disableRotation: vi.fn() };
    constructor() {
      state.maps.push(this);
    }
    on(event: string, handler: () => void) {
      this.handlers[event] = handler;
      return this;
    }
    getContainer() {
      return { getBoundingClientRect: () => ({ width: 400, height: 300 }) };
    }
    project() {
      return { x: 100, y: 100 };
    }
    getZoom() {
      return 10;
    }
    addSource() {}
    addLayer() {}
    getSource() {
      return { setData: vi.fn() };
    }
    zoomIn() {}
    zoomOut() {}
  }

  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }

  return { state, FakeMap, FakeMarker, FakeBounds };
});

vi.mock("mapbox-gl", () => ({
  default: { Map: fake.FakeMap, Marker: fake.FakeMarker, LngLatBounds: fake.FakeBounds, accessToken: "" },
}));
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

import MapCanvas from "./MapCanvas";

const GEOMETRY: Array<[number, number]> = [
  [9.079, 45.628],
  [9.05, 45.66],
  [9.023, 45.699],
];

const props = {
  token: "pk.test",
  geometry: GEOMETRY,
  stations: [],
  selectedId: null,
  stopRoute: null,
  onSelectStation: () => {},
  onDeselect: () => {},
  onUnavailable: () => {},
};

const resizeTo = (width: number, height: number) => {
  for (const callback of fake.state.observerCallbacks) callback([{ contentRect: { width, height } }]);
};

beforeEach(() => {
  fake.state.maps.length = 0;
  fake.state.boundsPoints.length = 0;
  fake.state.observerCallbacks.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) {
        fake.state.observerCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("MapCanvas — ritorno da nascosto (dettaglio stazione → Risultati)", () => {
  it("alla prima dimensione nota inquadra il percorso", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    map.fitBounds.mockClear();
    map.resize.mockClear();

    resizeTo(400, 300);
    expect(map.resize).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("quando il contenitore torna visibile chiama resize() e riapplica fitBounds sui bounds del percorso", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    resizeTo(400, 300); // prima visibilità
    map.resize.mockClear();
    map.fitBounds.mockClear();

    resizeTo(0, 0); // Risultati nascosti dietro il dettaglio stazione (display: none)
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.resize).not.toHaveBeenCalled(); // nessun resize su un contenitore di dimensione 0

    resizeTo(412, 640); // ritorno a /results
    expect(map.resize).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    const [bounds, options] = map.fitBounds.mock.calls[0]!;
    expect(bounds.points).toEqual(GEOMETRY); // bounds costruiti su tutti i punti del percorso
    expect(options).toMatchObject({ duration: 0, maxZoom: 15, padding: expect.objectContaining({ top: expect.any(Number) }) });
  });

  it("vale a ogni ritorno, non solo il primo", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    resizeTo(400, 300);
    map.fitBounds.mockClear();

    for (let i = 0; i < 3; i++) {
      resizeTo(0, 0);
      resizeTo(400, 300);
    }
    expect(map.fitBounds).toHaveBeenCalledTimes(3);
  });

  it("un semplice ridimensionamento a contenitore visibile fa resize() ma non reinquadra (niente salti di mappa)", () => {
    render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    resizeTo(400, 300);
    map.resize.mockClear();
    map.fitBounds.mockClear();

    resizeTo(400, 260); // es. foglio espanso: la mappa si accorcia
    expect(map.resize).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("usa il percorso più recente (nuova ricerca mentre i Risultati erano nascosti)", () => {
    const { rerender } = render(<MapCanvas {...props} />);
    const map = fake.state.maps[0]!;
    resizeTo(400, 300);
    resizeTo(0, 0);
    const next: Array<[number, number]> = [
      [11.0, 44.0],
      [12.0, 45.0],
    ];
    rerender(<MapCanvas {...props} geometry={next} />);
    map.fitBounds.mockClear();
    fake.state.boundsPoints.length = 0;

    resizeTo(400, 300);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0]![0].points).toEqual(next);
  });
});

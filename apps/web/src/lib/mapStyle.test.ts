import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE_URL, MAP_LANGUAGE, resolveMapStyle, STANDARD_CONFIG } from "./mapStyle";

describe("resolveMapStyle", () => {
  it("senza VITE_MAPBOX_STYLE_URL usa il basemap Standard di default", () => {
    expect(resolveMapStyle(undefined)).toEqual({ url: DEFAULT_STYLE_URL, isStandard: true });
    expect(resolveMapStyle("")).toEqual({ url: DEFAULT_STYLE_URL, isStandard: true });
    expect(resolveMapStyle("   ")).toEqual({ url: DEFAULT_STYLE_URL, isStandard: true });
  });

  it("con un URL di stile valido lo usa e non applica config/slot di Standard", () => {
    expect(resolveMapStyle("mapbox://styles/routefuel/ckabc123xyz")).toEqual({
      url: "mapbox://styles/routefuel/ckabc123xyz",
      isStandard: false,
    });
    expect(resolveMapStyle("  mapbox://styles/routefuel/brand-v1  ").url).toBe("mapbox://styles/routefuel/brand-v1");
  });

  it("uno stile che coincide con Standard resta Standard", () => {
    expect(resolveMapStyle("mapbox://styles/mapbox/standard").isStandard).toBe(true);
  });

  it("un valore non valido (non mapbox://styles/...) ricade sul default, senza mai passare URL arbitrari a Mapbox", () => {
    for (const bad of ["https://evil.example/style.json", "mapbox://styles/solo-utente", "javascript:alert(1)", "mapbox://styles/a/b/c"]) {
      expect(resolveMapStyle(bad)).toEqual({ url: DEFAULT_STYLE_URL, isStandard: true });
    }
  });
});

describe("configurazione di default", () => {
  it("tema monocromatico, etichette in italiano, niente POI né 3D", () => {
    expect(STANDARD_CONFIG.basemap.theme).toBe("monochrome");
    expect(STANDARD_CONFIG.basemap.showPointOfInterestLabels).toBe(false);
    expect(STANDARD_CONFIG.basemap.show3dObjects).toBe(false);
    expect(MAP_LANGUAGE).toBe("it");
  });
});

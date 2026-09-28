import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../../src/errors";
import { FixtureGeocodingProvider } from "../../src/providers/geocoding/FixtureGeocodingProvider";
import { MapboxGeocodingProvider } from "../../src/providers/geocoding/MapboxGeocodingProvider";

const TOKEN = "pk.test-token-should-never-leak";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Feature nel formato reale della Geocoding API v6 (verificato dal vivo). */
const addressFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [9.1904, 45.464205] },
  properties: {
    mapbox_id: "abc123",
    feature_type: "address",
    full_address: "Piazza del Duomo 23, 20121 Milano città metropolitana di Milano, Italia",
    name: "Piazza del Duomo 23",
    place_formatted: "20121 Milano città metropolitana di Milano, Italia",
    coordinates: { longitude: 9.1904, latitude: 45.464205, accuracy: "point" },
  },
};

describe("MapboxGeocodingProvider", () => {
  it("chiama la Geocoding API v6 forward con autocomplete, filtro Italia e bias di prossimità", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ type: "FeatureCollection", features: [addressFeature] }));
    const provider = new MapboxGeocodingProvider({ token: TOKEN, fetchImpl });

    await provider.autocomplete("piazza duomo", { proximity: { lon: 9.19, lat: 45.46 }, limit: 3 });

    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://api.mapbox.com/search/geocode/v6/forward");
    expect(url.searchParams.get("q")).toBe("piazza duomo");
    expect(url.searchParams.get("autocomplete")).toBe("true");
    expect(url.searchParams.get("country")).toBe("it");
    expect(url.searchParams.get("language")).toBe("it");
    expect(url.searchParams.get("proximity")).toBe("9.19,45.46");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("access_token")).toBe(TOKEN);
  });

  it("non usa la Search Box API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [] }));
    await new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).autocomplete("bologna");
    expect(String(fetchImpl.mock.calls[0]![0])).not.toContain("searchbox");
  });

  it("omette il parametro proximity se non fornito", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [] }));
    await new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).autocomplete("bologna");
    expect(new URL(fetchImpl.mock.calls[0]![0] as string).searchParams.has("proximity")).toBe(false);
  });

  it("trasforma le feature in suggerimenti con coordinate e etichetta completa", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [addressFeature] }));
    const suggestions = await new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).autocomplete("duomo");

    expect(suggestions).toEqual([
      {
        id: "abc123",
        name: "Piazza del Duomo 23",
        label: "Piazza del Duomo 23, 20121 Milano città metropolitana di Milano, Italia",
        lon: 9.1904,
        lat: 45.464205,
      },
    ]);
  });

  it("compone l'etichetta da name + place_formatted quando manca full_address", async () => {
    const feature = {
      ...addressFeature,
      properties: { ...addressFeature.properties, full_address: undefined, name: "Bologna", place_formatted: "Emilia-Romagna, Italia" },
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [feature] }));
    const [suggestion] = await new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).autocomplete("bologna");
    expect(suggestion?.label).toBe("Bologna, Emilia-Romagna, Italia");
  });

  it("scarta le feature malformate senza far fallire l'intera risposta", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ features: [{ properties: { name: "senza coordinate" } }, addressFeature, null] }));
    const suggestions = await new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).autocomplete("duomo");
    expect(suggestions).toHaveLength(1);
  });

  it("reverse: usa longitude/latitude e restituisce l'etichetta della prima feature", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [addressFeature] }));
    const label = await new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).reverse({ lon: 9.19, lat: 45.4642 });

    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/search/geocode/v6/reverse");
    expect(url.searchParams.get("longitude")).toBe("9.19");
    expect(url.searchParams.get("latitude")).toBe("45.4642");
    expect(label).toContain("Piazza del Duomo 23");
  });

  it("reverse: restituisce null se non trova nulla", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [] }));
    expect(await new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).reverse({ lon: 0, lat: 0 })).toBeNull();
  });

  it.each([
    [401, /credenziali/],
    [403, /credenziali/],
    [429, /troppe richieste/],
    [500, /errore HTTP 500/],
  ])("HTTP %i → ProviderError leggibile", async (status, message) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "x" }, status));
    const promise = new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).autocomplete("bologna");
    await expect(promise).rejects.toBeInstanceOf(ProviderError);
    await expect(promise).rejects.toThrow(message);
  });

  it("un errore di rete non fa mai trapelare token o URL nel messaggio", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(`fetch failed: https://api.mapbox.com/...access_token=${TOKEN}`));
    const promise = new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).autocomplete("bologna");
    await expect(promise).rejects.toBeInstanceOf(ProviderError);
    await expect(promise).rejects.not.toThrow(TOKEN);
    await expect(promise).rejects.not.toThrow(/mapbox\.com/);
  });

  it("una risposta con struttura inattesa è un ProviderError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(new MapboxGeocodingProvider({ token: TOKEN, fetchImpl }).autocomplete("bologna")).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

describe("FixtureGeocodingProvider", () => {
  const provider = new FixtureGeocodingProvider();

  it("trova un luogo noto ignorando maiuscole, accenti e ordine dei termini", async () => {
    const results = await provider.autocomplete("centrale MILANO");
    expect(results.map((r) => r.name)).toContain("Milano Centrale");
  });

  it("restituisce coordinate reali e un id stabile", async () => {
    const [bologna] = await provider.autocomplete("bologna centrale");
    expect(bologna).toMatchObject({ name: "Bologna Centrale", lon: 11.3426, lat: 44.5058 });
    expect(bologna?.id).toBe("fixture:bologna-centrale");
  });

  it("ordina per vicinanza quando c'è un bias di prossimità", async () => {
    const nearRome = await provider.autocomplete("centrale", { proximity: { lon: 12.5, lat: 41.9 } });
    const nearMilan = await provider.autocomplete("centrale", { proximity: { lon: 9.19, lat: 45.46 } });
    expect(nearRome[0]?.name).not.toBe(nearMilan[0]?.name);
    expect(nearMilan[0]?.name).toBe("Milano Centrale");
  });

  it("rispetta il limite di risultati", async () => {
    expect(await provider.autocomplete("italia", { limit: 2 })).toHaveLength(2);
  });

  it("nessuna corrispondenza → lista vuota; query vuota → lista vuota", async () => {
    expect(await provider.autocomplete("zzzzzz")).toEqual([]);
    expect(await provider.autocomplete("   ")).toEqual([]);
  });

  it("reverse: trova il luogo noto più vicino entro 5 km, altrimenti null", async () => {
    expect(await provider.reverse({ lon: 9.2045, lat: 45.4866 })).toContain("Milano Centrale");
    expect(await provider.reverse({ lon: 0, lat: 0 })).toBeNull();
  });
});

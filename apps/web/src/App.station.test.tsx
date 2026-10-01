import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDetail } from "./test/fixtures";

// Ricerca già riuscita: si prova la navigazione Risultati ↔ dettaglio stazione senza passare dal form.
vi.mock("./hooks/useSearch", async () => {
  const fixtures = await import("./test/fixtures");
  const response = fixtures.makeResponse();
  const state = {
    status: "success",
    response,
    results: response.results,
    refinement: response.refinement,
    request: fixtures.REQUEST,
    labels: { origin: "Via Roma 1, 20100 Milano", destination: "Piazza Maggiore, 40124 Bologna" },
  };
  return { useSearch: () => ({ state, search: vi.fn() }) };
});

// La mappa reale richiede WebGL: lo stub conta quante volte viene montata (una sola = lo stato è stato preservato).
const mapMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("./components/results/MapView", () => ({
  MapView: () => {
    useEffect(() => {
      mapMounts.count += 1;
    }, []);
    return <div data-testid="map-stub" />;
  },
}));

import App from "./App";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mapMounts.count = 0;
  fetchSpy = vi.fn(async (url: string) => {
    if (String(url).endsWith("/route")) {
      return { ok: true, json: async () => ({ searchId: "s1", stationId: 2, distanceKm: 1, durationMinutes: 1, detourKm: 1, detourMinutes: 1, geometry: [[9, 45], [10, 45]] }) };
    }
    return { ok: true, json: async () => makeDetail() };
  });
  vi.stubGlobal("fetch", fetchSpy);
  localStorage.clear();
  window.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

const renderApp = (path = "/results") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const cardIds = () => screen.getAllByTestId("station-card").map((el) => Number(el.getAttribute("data-station-id")));
const resultsWrapper = () => screen.getByTestId("bottom-sheet").parentElement!.parentElement!;

describe("App — dal dettaglio stazione ai Risultati", () => {
  it("tap su una scheda apre il dettaglio (chiamata on-demand) e nasconde header globale e barra inferiore", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();

    await user.click(screen.getAllByTestId("station-card")[1]!);
    expect(await screen.findByRole("heading", { name: "1858 BREGNANO" })).toBeInTheDocument();

    const detailCalls = fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith("/stations/2"));
    expect(detailCalls).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Navigazione principale" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("banner")).toHaveLength(1); // solo l'header a pila della schermata di dettaglio
    expect(resultsWrapper()).toHaveClass("hidden");
  });

  it("«Info» apre lo stesso dettaglio", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(within(screen.getAllByTestId("station-card")[0]!).getByRole("button", { name: /Info su/ }));
    await screen.findByRole("heading", { name: "1858 BREGNANO" });
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).endsWith("/search/s1/stations/1"))).toBe(true);
  });

  it("indietro riporta ai Risultati con ordinamento, filtri, selezione e mappa preservati (nessun rimontaggio)", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Minor deviazione" }));
    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    const before = cardIds();
    expect(before).toEqual([1]);
    await user.click(screen.getByRole("button", { name: "Autostrada" })); // torna a tutte e tre
    const order = cardIds();
    expect(order).toEqual([2, 3, 1]); // «Minor deviazione»

    await user.click(screen.getAllByTestId("station-card")[0]!);
    await screen.findByRole("heading", { name: "1858 BREGNANO" });
    await user.click(screen.getByRole("button", { name: "Torna ai risultati" }));

    await waitFor(() => expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument());
    expect(resultsWrapper()).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Minor deviazione" })).toHaveAttribute("aria-pressed", "true");
    expect(cardIds()).toEqual(order);
    expect(screen.getAllByTestId("station-card")[0]).toHaveAttribute("aria-current", "true"); // la stazione aperta resta selezionata
    expect(mapMounts.count).toBe(1);
  });
});

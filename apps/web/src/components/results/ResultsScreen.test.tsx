import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchState } from "../../hooks/useSearch";
import { makeResponse, makeResult, REQUEST } from "../../test/fixtures";
import type { MapStation } from "./MapCanvas";

// Mapbox GL richiede WebGL, assente in jsdom: la mappa è sostituita da uno stub che espone le props ricevute.
const mapProps: { current: { stations: MapStation[]; selectedId: number | null; onSelectStation: (id: number) => void } | null } = {
  current: null,
};
vi.mock("./MapView", () => ({
  MapView: (props: { stations: MapStation[]; selectedId: number | null; onSelectStation: (id: number) => void }) => {
    mapProps.current = props;
    return <div data-testid="map-stub">{props.stations.map((s) => s.id).join(",")}</div>;
  },
}));

import { ResultsScreen } from "./ResultsScreen";

type SuccessState = Extract<SearchState, { status: "success" }>;

function makeState(overrides: Partial<SuccessState> = {}): SuccessState {
  const response = overrides.response ?? makeResponse();
  return {
    status: "success",
    response,
    results: response.results,
    refinement: response.refinement,
    request: REQUEST,
    labels: { origin: "Via Roma 1, 20100 Milano città metropolitana di Milano, Italia", destination: "Piazza Maggiore, 40124 Bologna, Italia" },
    ...overrides,
  };
}

const cardIds = () => screen.getAllByTestId("station-card").map((el) => Number(el.getAttribute("data-station-id")));

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  mapProps.current = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResultsScreen — contenuto", () => {
  it("mostra capsula di telemetria, elenco e nome delle stazioni", () => {
    render(<ResultsScreen state={makeState()} />);

    expect(screen.getByText(/Milano → Bologna/)).toBeInTheDocument();
    expect(screen.getByText("217 km")).toBeInTheDocument();
    expect(screen.getByText("2h 33m")).toBeInTheDocument();
    expect(screen.getByText("3 staz.")).toBeInTheDocument();
    expect(cardIds()).toEqual([1, 2, 3]);
    expect(screen.getByRole("heading", { name: "Alfa Autostrada" })).toBeInTheDocument();
  });

  it("la card mostra brand (iniziali), prezzo, deviazione e risparmio", () => {
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[0]!;

    expect(within(card).getByText("AE")).toBeInTheDocument(); // Agip Eni
    expect(within(card).getByText("€1,890")).toBeInTheDocument();
    expect(within(card).getByText("Benzina Self")).toBeInTheDocument();
    expect(within(card).getByText(/~\+3,0 km \(\+3 min\)/)).toBeInTheDocument(); // stima proxy → "~"
    expect(within(card).getByText(/Risparmi ~€ 12,00/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /Info su/ })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /Naviga verso/ })).toBeInTheDocument();
  });

  it("le cifre sono tabulari (tabular-nums) su prezzi, distanze e importi", () => {
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[0]!;
    expect(within(card).getByText("€1,890")).toHaveClass("tabular-nums");
    expect(within(card).getByText(/Risparmi/)).toHaveClass("tabular-nums");
    expect(screen.getByText("3 staz.")).toHaveClass("tabular-nums");
  });

  it("un risparmio negativo è «Non conviene» e una verifica sul routing reale toglie la tilde", () => {
    render(<ResultsScreen state={makeState()} />);
    const gamma = screen.getAllByTestId("station-card")[2]!;
    expect(within(gamma).getByText(/Non conviene € 2,00/)).toBeInTheDocument();
    expect(within(gamma).getByText(/\+1,5 km/)).not.toHaveTextContent("~");
    expect(within(gamma).getByText("Solo servito")).toBeInTheDocument();
  });

  it("solo la stazione con il maggior risparmio ha il badge «Migliore»", () => {
    render(<ResultsScreen state={makeState()} />);
    const badges = screen.getAllByText("Migliore");
    expect(badges).toHaveLength(1);
    expect(badges[0]!.closest("[data-testid=station-card]")).toHaveAttribute("data-station-id", "1");
    expect(mapProps.current?.stations.filter((s) => s.best).map((s) => s.id)).toEqual([1]);
  });

  it("dichiara il prezzo di riferimento e il livello usato (P_avg)", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(screen.getByTestId("reference-price")).toHaveTextContent("Prezzo di riferimento €2,150/L (mediana di 40 stazioni sul percorso)");
  });

  it("nessun «Migliore» se nessuna stazione conviene", () => {
    const results = [makeResult({ station: { id: 1 }, netSavings: -1 }), makeResult({ station: { id: 2 }, netSavings: 0 })];
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);
    expect(screen.queryByText("Migliore")).not.toBeInTheDocument();
  });

  it("nessuna stazione → messaggio, senza card", () => {
    render(<ResultsScreen state={makeState({ response: makeResponse({ results: [] }), results: [] })} />);
    expect(screen.getByText("Nessuna stazione conveniente sul percorso")).toBeInTheDocument();
    expect(screen.queryAllByTestId("station-card")).toHaveLength(0);
  });
});

describe("ResultsScreen — ordinamento e filtri (client-side, senza rete)", () => {
  it("«Minor deviazione» e «Sul percorso» (ordine di percorrenza) riordinano l'elenco e la mappa, senza alcuna chiamata di rete", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    expect(cardIds()).toEqual([1, 2, 3]);

    await user.click(screen.getByRole("button", { name: "Minor deviazione" }));
    expect(cardIds()).toEqual([2, 3, 1]);
    expect(screen.getByTestId("map-stub")).toHaveTextContent("2,3,1");

    await user.click(screen.getByRole("button", { name: "Sul percorso" }));
    expect(cardIds()).toEqual([2, 3, 1]);
    expect(screen.getByTestId("map-stub")).toHaveTextContent("2,3,1");

    await user.click(screen.getByRole("button", { name: "Più conveniente" }));
    expect(cardIds()).toEqual([1, 2, 3]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("il chip attivo è verde (bg-primary) e l'inattivo no; lo stato è esposto con aria-pressed", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const savings = screen.getByRole("button", { name: "Più conveniente" });
    const detour = screen.getByRole("button", { name: "Minor deviazione" });
    expect(savings).toHaveAttribute("aria-pressed", "true");
    expect(savings).toHaveClass("bg-primary", "text-on-primary");
    expect(detour).toHaveAttribute("aria-pressed", "false");
    expect(detour).not.toHaveClass("bg-primary");

    await user.click(detour);
    expect(detour).toHaveClass("bg-primary");
    expect(savings).not.toHaveClass("bg-primary");
  });

  it("«Solo Self» nasconde le stazioni solo servito e si può disattivare (ricerca fatta senza Solo Self)", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const pill = screen.getByRole("button", { name: "Solo Self" });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(pill).toBeEnabled();

    await user.click(pill);
    expect(cardIds()).toEqual([1, 2]);
    expect(screen.getByText("2 staz.")).toBeInTheDocument();

    await user.click(pill);
    expect(cardIds()).toEqual([1, 2, 3]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("se la ricerca era già «Solo Self» la pill è attiva e bloccata (non c'è nulla da aggiungere lato client)", () => {
    render(<ResultsScreen state={makeState({ request: { ...REQUEST, onlySelf: true } })} />);
    const pill = screen.getByRole("button", { name: "Solo Self" });
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(pill).toBeDisabled();
  });

  it("«Autostrada» filtra per Tipo Impianto", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);

    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    expect(cardIds()).toEqual([1]);
    expect(screen.getByText("1 staz.")).toBeInTheDocument();
    expect(mapProps.current?.stations.map((s) => s.id)).toEqual([1]);
  });

  it("filtri senza risultati → messaggio e «Azzera i filtri» ripristina l'elenco", async () => {
    const user = userEvent.setup();
    const results = [makeResult({ station: { id: 5, tipoImpianto: "stradale" } })];
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);

    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    expect(screen.getByText("Nessuna stazione con questi filtri")).toBeInTheDocument();
    expect(screen.queryAllByTestId("station-card")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(cardIds()).toEqual([5]);
  });

  it("«Sul percorso» mostra per prima la stazione più vicina alla partenza lungo il tracciato", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    await user.click(screen.getByRole("button", { name: "Sul percorso" }));
    const along = screen.getAllByTestId("station-card").map((card) => Number(/A (\d+),\d km dalla partenza/.exec(card.textContent ?? "")?.[1]));
    expect(along).toEqual([...along].sort((a, b) => a - b));
    expect(along[0]).toBe(20);
  });

  it("una nuova ricerca (searchId diverso) riparte da filtri puliti", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResultsScreen state={makeState()} />);
    await user.click(screen.getByRole("button", { name: "Minor deviazione" }));
    await user.click(screen.getByRole("button", { name: "Autostrada" }));
    expect(cardIds()).toEqual([1]);

    rerender(<ResultsScreen state={makeState({ response: makeResponse({ searchId: "s2" }) })} />);
    expect(screen.getByRole("button", { name: "Più conveniente" })).toHaveAttribute("aria-pressed", "true");
    expect(cardIds()).toEqual([1, 2, 3]);
  });
});

describe("ResultsScreen — elenco lungo", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => makeResult({ station: { id: 1000 + i }, netSavings: 100 - i }));

  it("mostra subito le prime 20 schede, «Mostra altre» aggiunge le successive; la mappa riceve tutte le stazioni", async () => {
    const user = userEvent.setup();
    const results = many(45);
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);

    expect(screen.getAllByTestId("station-card")).toHaveLength(20);
    expect(mapProps.current?.stations).toHaveLength(45);
    expect(screen.getByText("45 staz.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mostra altre 20 stazioni (25 rimaste)" }));
    expect(screen.getAllByTestId("station-card")).toHaveLength(40);
    await user.click(screen.getByRole("button", { name: "Mostra altre 5 stazioni (5 rimaste)" }));
    expect(screen.getAllByTestId("station-card")).toHaveLength(45);
    expect(screen.queryByRole("button", { name: /Mostra altre/ })).not.toBeInTheDocument();
  });

  it("toccare sulla mappa il pin di una stazione oltre le schede mostrate la rende visibile nell'elenco", async () => {
    const { act } = await import("@testing-library/react");
    const results = many(45);
    render(<ResultsScreen state={makeState({ response: makeResponse({ results }), results })} />);
    expect(document.getElementById("station-1035")).toBeNull();

    act(() => mapProps.current?.onSelectStation(1035));
    expect(document.getElementById("station-1035")).not.toBeNull();
    expect(document.getElementById("station-1035")).toHaveAttribute("aria-current", "true");
  });
});

describe("ResultsScreen — contrasto del testo piccolo (WCAG AA)", () => {
  it("nessun testo sotto i 14px usa text-primary: si usa text-on-primary-fixed-variant", () => {
    const { container } = render(<ResultsScreen state={makeState()} />);
    const small = container.querySelectorAll(".text-label-sm, .text-label-md, .text-body-sm");
    expect(small.length).toBeGreaterThan(10);
    const offenders = [...small].filter((el) => el.classList.contains("text-primary")).map((el) => el.outerHTML.slice(0, 90));
    expect(offenders).toEqual([]);
  });

  it("il risparmio (pill verde chiara) e il conteggio in capsula usano il verde scuro", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(within(screen.getAllByTestId("station-card")[0]!).getByText(/Risparmi/)).toHaveClass("text-on-primary-fixed-variant", "bg-primary/10");
    expect(screen.getByText("3 staz.")).toHaveClass("text-on-primary-fixed-variant");
  });
});

describe("ResultsScreen — banner fonte dati", () => {
  it("mostra timestamp del file MIMIT e stato «in tempo reale»", () => {
    render(<ResultsScreen state={makeState()} />);
    const banner = screen.getByTestId("prices-banner");
    expect(banner).toHaveTextContent("MIMIT Osservaprezzi");
    expect(banner).toHaveTextContent(/file del 28 set 2026/);
    expect(banner).toHaveTextContent("Prezzi in tempo reale · aggiornati 4 min fa");
  });

  it.each([
    [{ status: "partial", tilesTotal: 37, tilesLive: 29, oldestLiveAgeMinutes: 1 } as const, "Tempo reale su 29 zone su 37 · per il resto file giornaliero"],
    [{ status: "unavailable", tilesTotal: 4, tilesLive: 0, oldestLiveAgeMinutes: null } as const, "Tempo reale non raggiungibile · uso il file giornaliero"],
    [{ status: "disabled", tilesTotal: 0, tilesLive: 0, oldestLiveAgeMinutes: null } as const, "Prezzi dal file giornaliero MIMIT"],
  ])("stato %j", (livePrices, text) => {
    render(<ResultsScreen state={makeState({ response: makeResponse({ livePrices }) })} />);
    expect(screen.getByTestId("prices-banner")).toHaveTextContent(text);
  });

  it("senza ingestione registrata lo dichiara invece di inventare una data", () => {
    render(<ResultsScreen state={makeState({ response: makeResponse({ pricesUpdatedAt: null }) })} />);
    expect(screen.getByTestId("prices-banner")).toHaveTextContent("nessuna ingestione registrata");
  });

  it("segnala la verifica del percorso in corso e nulla a verifica conclusa", () => {
    const { rerender } = render(<ResultsScreen state={makeState({ refinement: { status: "pending" } })} />);
    expect(screen.getByText("Verifico le deviazioni reali delle migliori stazioni…")).toBeInTheDocument();
    rerender(<ResultsScreen state={makeState({ refinement: { status: "done" } })} />);
    expect(screen.queryByText(/Verifico le deviazioni/)).not.toBeInTheDocument();
  });
});

describe("ResultsScreen — selezione, mappa e struttura", () => {
  it("toccare una card la seleziona e la passa alla mappa; un pin sulla mappa seleziona la card", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResultsScreen state={makeState()} />);

    await user.click(screen.getAllByTestId("station-card")[1]!);
    expect(screen.getAllByTestId("station-card")[1]).toHaveAttribute("aria-current", "true");
    expect(mapProps.current?.selectedId).toBe(2);

    const { act } = await import("@testing-library/react");
    act(() => mapProps.current?.onSelectStation(3));
    rerender(<ResultsScreen state={makeState()} />);
    expect(screen.getAllByTestId("station-card")[2]).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByTestId("station-card")[1]).not.toHaveAttribute("aria-current");
  });

  it("il foglio scorre da solo: area scrollabile interna, separata dalla regione della mappa", () => {
    render(<ResultsScreen state={makeState()} />);
    const sheet = screen.getByTestId("bottom-sheet");
    const scroll = screen.getByTestId("sheet-scroll");
    expect(sheet).toHaveClass("rounded-t-3xl");
    expect(scroll).toHaveClass("overflow-y-auto");
    expect(sheet.contains(scroll)).toBe(true);
    expect(screen.getByTestId("map-region").contains(scroll)).toBe(false);
    expect(screen.getByTestId("map-region")).toHaveClass("h-[40vh]");
  });

  it("il maniglione espande e riduce il foglio (la mappa si accorcia)", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    await user.click(screen.getByRole("button", { name: "Espandi l'elenco" }));
    expect(screen.getByTestId("map-region")).toHaveClass("h-[18vh]");
    await user.click(screen.getByRole("button", { name: /Riduci l'elenco/ }));
    expect(screen.getByTestId("map-region")).toHaveClass("h-[40vh]");
  });

  it("le card non contengono elementi non derivabili dai dati MIMIT (uscita, orari, servizi)", () => {
    render(<ResultsScreen state={makeState()} />);
    expect(screen.queryByText(/Uscita/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aperto ora/i)).not.toBeInTheDocument();
  });
});

describe("ResultsScreen — Info e Naviga (deep-link)", () => {
  const originalUA = navigator.userAgent;
  const setUA = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  afterEach(() => setUA(originalUA));

  it("Info apre il menu con Google Maps, Apple Maps e Waze, e si chiude con Esc", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    await user.click(within(screen.getAllByTestId("station-card")[0]!).getByRole("button", { name: /Info su/ }));

    const dialog = screen.getByRole("dialog", { name: "Apri in navigatore" });
    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Google Maps", "Apple Maps", "Waze"]);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
    expect(links[0]!.getAttribute("href")).toContain("destination=45.680000,9.050000");
    // Nessuna sezione del dettaglio completo (Screen 3) in questa milestone.
    expect(within(dialog).queryByText(/servizi|orari|bagni/i)).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Naviga su desktop apre il menu di scelta", async () => {
    const user = userEvent.setup();
    setUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ResultsScreen state={makeState()} />);
    await user.click(within(screen.getAllByTestId("station-card")[0]!).getByRole("button", { name: /Naviga verso/ }));

    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Apri in navigatore" })).toBeInTheDocument();
  });

  it("Naviga su iPhone apre Apple Maps, su Android Google Maps, direttamente", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ResultsScreen state={makeState()} />);
    const naviga = () => within(screen.getAllByTestId("station-card")[0]!).getByRole("button", { name: /Naviga verso/ });

    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1");
    await user.click(naviga());
    expect(open).toHaveBeenLastCalledWith(expect.stringContaining("https://maps.apple.com/"), "_blank", "noopener,noreferrer");

    setUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36");
    await user.click(naviga());
    expect(open).toHaveBeenLastCalledWith(expect.stringContaining("https://www.google.com/maps/dir/"), "_blank", "noopener,noreferrer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("i pulsanti della card non selezionano la stazione (non propagano il click)", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen state={makeState()} />);
    const card = screen.getAllByTestId("station-card")[0]!;
    await user.click(within(card).getByRole("button", { name: /Info su/ }));
    expect(card).not.toHaveAttribute("aria-current");
  });
});

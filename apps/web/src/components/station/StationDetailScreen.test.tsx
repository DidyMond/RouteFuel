import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKMARKS_KEY, resetBookmarkMemory } from "../../lib/bookmarks";
import { makeDetail } from "../../test/fixtures";
import { StationDetailScreen } from "./StationDetailScreen";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

const originalUA = navigator.userAgent;
const setUA = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

let fetchSpy: ReturnType<typeof vi.fn>;
const respondWith = (detail = makeDetail()) => fetchSpy.mockResolvedValue({ ok: true, json: async () => detail });

function renderScreen(path = "/station/s1/2") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/station/:searchId/:stationId" element={<StationDetailScreen />} />
        <Route path="/results" element={<div>PAGINA RISULTATI</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const loaded = async () => screen.findByRole("heading", { name: "1858 BREGNANO" });

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  localStorage.clear();
  resetBookmarkMemory();
  setUA(DESKTOP);
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setUA(originalUA);
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("StationDetailScreen — contenuto", () => {
  it("chiede il dettaglio per la ricerca e la stazione dell'URL e mostra meta, impatto e listino", async () => {
    respondWith();
    renderScreen();
    await loaded();

    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/search/s1/stations/2");
    expect(screen.getByTestId("station-address")).toHaveTextContent("S.P. 31 DELLA PIODA - VIA MILANO 79, BREGNANO (CO)");
    expect(screen.getByText("AE")).toBeInTheDocument(); // iniziali da Bandiera
    expect(screen.getByText("Stradale")).toBeInTheDocument();
    expect(screen.getByText("Gestore ENIMOOV S.P.A.")).toBeInTheDocument();
  });

  it("bento «Impatto sul tuo viaggio»: deviazione, risparmio netto sui litri e differenziale vs media", async () => {
    respondWith();
    renderScreen();
    await loaded();

    const detour = screen.getByTestId("tile-detour");
    expect(detour).toHaveTextContent("+1,6 km");
    expect(detour).toHaveTextContent("+3 min guida");
    expect(detour).not.toHaveTextContent("~");
    expect(detour).not.toHaveTextContent("stima");

    const savings = screen.getByTestId("tile-savings");
    expect(savings).toHaveTextContent("Risparmio");
    expect(savings).toHaveTextContent("€ 5,96");
    expect(savings).toHaveTextContent("su 45 L");

    const differential = screen.getByTestId("tile-differential");
    expect(differential).toHaveTextContent("−0,149");
    expect(differential).toHaveTextContent("€/L");
    expect(differential).toHaveTextContent("−7,0% medio");

    expect(screen.getByRole("region", { name: "Impatto sul tuo viaggio" })).toHaveTextContent("Riferimento €2,139/L (mediana di 63 stazioni sul percorso)");
  });

  it("le cifre sono tabulari (tabular-nums) su deviazione, risparmio, differenziale e prezzi", async () => {
    respondWith();
    renderScreen();
    await loaded();
    for (const id of ["tile-detour", "tile-savings", "tile-differential"]) {
      expect(screen.getByTestId(id).querySelectorAll("span.tabular-nums").length).toBeGreaterThan(0);
    }
    for (const tile of screen.getAllByTestId("price-tile")) {
      expect(within(tile).getByText(/^\d,\d{3}$/)).toHaveClass("tabular-nums");
    }
  });

  it("un risparmio non positivo non si nasconde: «Non conviene» con segno meno", async () => {
    respondWith(makeDetail({ impact: { ...makeDetail().impact, netSavings: -2, grossSavings: 0.4, detourCost: 2.4 } }));
    renderScreen();
    await loaded();
    const savings = screen.getByTestId("tile-savings");
    expect(savings).toHaveTextContent("Non conviene");
    expect(savings).toHaveTextContent("−€ 2,00");
  });

  it("matrice prezzi: una tile per ogni combinazione carburante × modalità, con la scelta della ricerca evidenziata", async () => {
    respondWith();
    renderScreen();
    await loaded();

    const tiles = screen.getAllByTestId("price-tile");
    expect(tiles.map((t) => `${t.getAttribute("data-fuel")}:${t.getAttribute("data-mode")}`)).toEqual([
      "benzina:self",
      "benzina:servito",
      "diesel:self",
      "diesel:servito",
    ]);
    expect(within(tiles[0]!).getByText("1,990")).toBeInTheDocument();
    expect(within(tiles[0]!).getByText("Self")).toBeInTheDocument();
    expect(within(tiles[1]!).getByText("Servito")).toBeInTheDocument();
    expect(within(tiles[0]!).getByText("€/L")).toBeInTheDocument();

    const chosen = tiles.filter((t) => t.getAttribute("aria-current") === "true");
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).toBe(tiles[0]);
    expect(chosen[0]).toHaveTextContent("Scelto nella ricerca");
    expect(chosen[0]).toHaveClass("ring-2");
  });

  it("evidenzia il Servito se è la combinazione scelta (stazione solo servito)", async () => {
    respondWith(makeDetail({ selected: { ...makeDetail().selected, isSelf: false, servitoOnly: true, price: 2.2 } }));
    renderScreen();
    await loaded();
    const chosen = screen.getAllByTestId("price-tile").find((t) => t.getAttribute("aria-current") === "true")!;
    expect(chosen).toHaveAttribute("data-fuel", "benzina");
    expect(chosen).toHaveAttribute("data-mode", "servito");
  });

  it("senza prezzi recenti lo dichiara invece di mostrare tile vuote", async () => {
    respondWith(makeDetail({ prices: [] }));
    renderScreen();
    await loaded();
    expect(screen.queryAllByTestId("price-tile")).toHaveLength(0);
    expect(screen.getByText("Nessun prezzo recente disponibile per questa stazione.")).toBeInTheDocument();
  });

  it("pill del tipo di impianto: «Autostradale» per le stazioni autostradali", async () => {
    respondWith(makeDetail({ station: { ...makeDetail().station, tipoImpianto: "autostradale" } }));
    renderScreen();
    await loaded();
    expect(screen.getByText("Autostradale")).toBeInTheDocument();
    expect(screen.queryByText("Stradale")).not.toBeInTheDocument();
  });
});

describe("StationDetailScreen — verificata o stima (nessun dato spacciato per verificato)", () => {
  it("deviazione verificata col routing: badge «Verificato MISE», nessuna tilde", async () => {
    respondWith();
    renderScreen();
    await loaded();
    expect(screen.getByText("Verificato MISE")).toBeInTheDocument();
    expect(screen.queryByText("Stima geometrica")).not.toBeInTheDocument();
  });

  it("routing non disponibile (source proxy): badge «Stima geometrica», tilde e «stima» nei tile", async () => {
    respondWith(makeDetail({ detour: { km: 2, minutes: 3, source: "proxy" } }));
    renderScreen();
    await loaded();

    expect(screen.getByText("Stima geometrica")).toBeInTheDocument();
    expect(screen.queryByText("Verificato MISE")).not.toBeInTheDocument();
    const detour = screen.getByTestId("tile-detour");
    expect(detour).toHaveTextContent("~+2,0 km");
    expect(detour).toHaveTextContent("~+3 min guida");
    expect(detour).toHaveTextContent("stima");
    expect(screen.getByTestId("tile-savings")).toHaveTextContent("~€ 5,96");
  });
});

describe("StationDetailScreen — nessun dato inventato", () => {
  it("non c'è alcuna sezione per uscita autostradale, orari, servizi, telefono o numero di pompe (nemmeno segnaposto)", async () => {
    respondWith();
    const { container } = renderScreen();
    await loaded();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/uscita|aperto|24\s*\/\s*7|24h|orari|servizi|amenit|telefono|chiama|pompe|bagni|wi-?fi|bar\b|ristor/i);
    expect(container.querySelector("a[href^='tel:']")).toBeNull();
    // Solo i campi MIMIT: nome, bandiera, gestore, indirizzo, tipo impianto, prezzi.
    expect(screen.getByRole("region", { name: "Stazione" })).toBeInTheDocument();
  });
});

describe("StationDetailScreen — caricamento ed errori", () => {
  it("durante il caricamento mostra lo stato e disattiva salva, condividi e navigazione", () => {
    fetchSpy.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByRole("status")).toHaveTextContent("Verifico la deviazione sul percorso reale");
    expect(screen.getByRole("button", { name: "Salva per il ritorno" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Condividi la stazione" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Apri nel Navigatore/ })).toBeDisabled();
  });

  it("errore di rete: messaggio, «Riprova» rifà la richiesta", async () => {
    const user = userEvent.setup();
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderScreen();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare la stazione");

    respondWith();
    await user.click(screen.getByRole("button", { name: "Riprova" }));
    await loaded();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("ricerca scaduta (404): spiega che serve rifare la ricerca, senza «Riprova»", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: "SEARCH_NOT_FOUND", message: "Ricerca non trovata o scaduta." } }) });
    renderScreen();
    expect(await screen.findByRole("alert")).toHaveTextContent("Questa ricerca non è più disponibile");
    expect(screen.queryByRole("button", { name: "Riprova" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Torna ai risultati" })).toBeInTheDocument();
  });
});

describe("StationDetailScreen — navigazione e back", () => {
  it("il back button torna a /results", async () => {
    const user = userEvent.setup();
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Torna ai risultati" }));
    expect(screen.getByText("PAGINA RISULTATI")).toBeInTheDocument();
  });
});

describe("StationDetailScreen — «Apri nel Navigatore» (deep-link)", () => {
  const cta = () => screen.getByRole("button", { name: /Apri nel Navigatore/ });

  it("iPhone: apre direttamente Apple Maps con le coordinate della stazione", async () => {
    const user = userEvent.setup();
    setUA(IPHONE);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    respondWith();
    renderScreen();
    await loaded();
    await user.click(cta());

    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0]!;
    expect(String(url)).toContain("https://maps.apple.com/");
    expect(String(url)).toContain("daddr=45.685986,9.054773");
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Android: apre direttamente Google Maps con le coordinate della stazione", async () => {
    const user = userEvent.setup();
    setUA(ANDROID);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    respondWith();
    renderScreen();
    await loaded();
    await user.click(cta());

    expect(String(open.mock.calls[0]![0])).toContain("https://www.google.com/maps/dir/?api=1&destination=45.685986,9.054773");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("desktop o sistema sconosciuto: non apre nulla e mostra il menu con Google Maps, Apple Maps e Waze", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    respondWith();
    renderScreen();
    await loaded();
    await user.click(cta());

    expect(open).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Apri in navigatore" });
    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Google Maps", "Apple Maps", "Waze"]);
    for (const link of links) expect(link.getAttribute("href")).toMatch(/45\.685986[,&]|ll=45\.685986,9\.054773/);
    expect(links[2]!.getAttribute("href")).toContain("waze.com/ul?ll=45.685986,9.054773");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("il pulsante secondario apre sempre il menu di scelta, anche su iPhone e Android", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    respondWith();
    renderScreen();
    await loaded();

    for (const ua of [IPHONE, ANDROID, DESKTOP]) {
      setUA(ua);
      await user.click(screen.getByRole("button", { name: "Scegli l'app di navigazione" }));
      expect(screen.getByRole("dialog", { name: "Apri in navigatore" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("il menu mostra prezzo scelto e risparmio della stazione", async () => {
    const user = userEvent.setup();
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Scegli l'app di navigazione" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("€1,990");
    expect(dialog).toHaveTextContent("Benzina Self");
    expect(dialog).toHaveTextContent("Risparmi € 5,96");
  });
});

describe("StationDetailScreen — Copia indirizzo", () => {
  it("copia l'indirizzo completo negli appunti e lo conferma", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Copia" }));

    expect(writeText).toHaveBeenCalledWith("S.P. 31 DELLA PIODA - VIA MILANO 79, BREGNANO (CO)");
    expect(await screen.findByText("Indirizzo copiato")).toBeInTheDocument();
  });

  it("se la copia non è possibile lo dice, senza lanciare", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("negato")) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Copia" }));
    expect(await screen.findByText(/Copia non riuscita/)).toBeInTheDocument();
  });
});

describe("StationDetailScreen — Salva (localStorage)", () => {
  const save = () => screen.getByRole("button", { name: /Salva per il ritorno|Rimuovi dai salvati/ });

  it("salva la stazione in localStorage, la rimuove al secondo tap e ricorda lo stato", async () => {
    const user = userEvent.setup();
    respondWith();
    const { unmount } = renderScreen();
    await loaded();
    expect(save()).toHaveAttribute("aria-pressed", "false");

    await user.click(save());
    expect(save()).toHaveAttribute("aria-pressed", "true");
    expect(save()).toHaveAccessibleName("Rimuovi dai salvati");
    expect(await screen.findByText("Stazione salvata")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(BOOKMARKS_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 2, nomeImpianto: "1858 BREGNANO", comune: "BREGNANO", lat: 45.685986, lon: 9.054773 });
    expect(Number.isNaN(Date.parse(stored[0].savedAt))).toBe(false);

    // Riaprendo la stazione il segnalibro c'è ancora.
    unmount();
    renderScreen();
    await loaded();
    expect(save()).toHaveAttribute("aria-pressed", "true");

    await user.click(save());
    expect(save()).toHaveAttribute("aria-pressed", "false");
    expect(JSON.parse(localStorage.getItem(BOOKMARKS_KEY)!)).toEqual([]);
    expect(await screen.findByText("Rimossa dai salvati")).toBeInTheDocument();
  });

  it("con localStorage non disponibile funziona comunque (per la sessione)", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage bloccato");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage bloccato");
    });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(save());
    expect(save()).toHaveAttribute("aria-pressed", "true");
  });

  it("ignora dati corrotti in localStorage", async () => {
    localStorage.setItem(BOOKMARKS_KEY, "{non è json");
    respondWith();
    renderScreen();
    await loaded();
    expect(save()).toHaveAttribute("aria-pressed", "false");
  });
});

describe("StationDetailScreen — Condividi (Web Share API)", () => {
  it("usa la Web Share API con nome, prezzo, indirizzo e il link a Google Maps con le coordinate", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Condividi la stazione" }));

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0]![0];
    expect(payload.title).toBe("1858 BREGNANO");
    expect(payload.text).toContain("Benzina Self €1,990/L");
    expect(payload.text).toContain("S.P. 31 DELLA PIODA - VIA MILANO 79, BREGNANO (CO)");
    expect(payload.url).toContain("https://www.google.com/maps/dir/?api=1&destination=45.685986,9.054773");
  });

  it("senza Web Share API (desktop) copia testo e link negli appunti e lo dice", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Condividi la stazione" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]![0]).toContain("1858 BREGNANO");
    expect(writeText.mock.calls[0]![0]).toContain("https://www.google.com/maps/dir/");
    expect(await screen.findByText("Link copiato negli appunti")).toBeInTheDocument();
  });

  it("se l'utente chiude il foglio di condivisione non compare alcun errore", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    respondWith();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Condividi la stazione" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText(/non riuscita/)).not.toBeInTheDocument();
    expect(screen.queryByText(/copiato/i)).not.toBeInTheDocument();
  });
});

describe("StationDetailScreen — robustezza", () => {
  it("un window.scrollTo che restituisce un valore (come in alcuni browser) non rompe gli effetti: nessun errore in console", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    window.scrollTo = vi.fn().mockReturnValue(Promise.resolve());
    respondWith();
    renderScreen();
    await loaded();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("StationDetailScreen — design system", () => {
  it("header e CTA tengono conto della safe-area; la CTA ha la sfocatura progressiva", async () => {
    respondWith();
    const { container } = renderScreen();
    await loaded();

    expect(screen.getByRole("banner")).toHaveClass("pt-safe");
    expect(screen.getByTestId("progressive-blur")).toHaveClass("progressive-blur");
    expect(screen.getByTestId("progressive-blur").querySelectorAll("span")).toHaveLength(3);
    expect(container.innerHTML).toContain("pb-[calc(1rem+env(safe-area-inset-bottom,0px))]");
    expect(container.innerHTML).toContain("backdrop-blur-xl");
  });

  it("header a pila: indietro a sinistra, brand al centro, salva, condividi e avatar a destra", async () => {
    respondWith();
    renderScreen();
    await loaded();
    const header = screen.getByRole("banner");
    expect(within(header).getByText("RouteFuel")).toBeInTheDocument();
    for (const name of ["Torna ai risultati", "Salva per il ritorno", "Condividi la stazione"]) {
      expect(within(header).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(header).getByRole("img", { name: "RF, profilo utente" })).toBeInTheDocument();
  });

  it("raggi e ombre dei token: card `rounded-lg`, tile `rounded-DEFAULT`, CTA e pill `rounded-full`", async () => {
    respondWith();
    renderScreen();
    await loaded();
    expect(screen.getByRole("region", { name: "Stazione" })).toHaveClass("rounded-lg");
    expect(screen.getByRole("region", { name: "Impatto sul tuo viaggio" })).toHaveClass("rounded-lg", "shadow-md");
    expect(screen.getByRole("region", { name: "Listino carburanti" })).toHaveClass("rounded-lg");
    expect(screen.getByTestId("tile-detour")).toHaveClass("rounded-DEFAULT");
    expect(screen.getAllByTestId("price-tile")[0]).toHaveClass("rounded-DEFAULT");
    expect(screen.getByRole("button", { name: /Apri nel Navigatore/ })).toHaveClass("rounded-full", "bg-primary");
  });

  it("nessun testo ≤14px usa text-primary, text-secondary o text-outline (regola di contrasto)", async () => {
    respondWith();
    const { container } = renderScreen();
    await loaded();
    const small = container.querySelectorAll(".text-label-sm, .text-label-md, .text-label-lg, .text-body-sm, .text-body-md");
    expect(small.length).toBeGreaterThan(10);
    const weak = ["text-primary", "text-secondary", "text-outline"];
    expect([...small].filter((el) => weak.some((cls) => el.classList.contains(cls)))).toEqual([]);
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsProvider } from "../../hooks/useSettings";
import {
  FACTORY_SETTINGS,
  loadSettings,
  referenceOverrideFor,
  resetSettingsMemory,
  saveSettings,
  SETTINGS_KEY,
  type Settings,
} from "../../lib/settings";
import { SettingsScreen } from "./SettingsScreen";

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
});

const seed = (patch: Partial<Settings> = {}) => saveSettings({ ...FACTORY_SETTINGS, ...patch });

function renderScreen() {
  return render(
    <SettingsProvider>
      <SettingsScreen />
    </SettingsProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;
const SECTIONS = ["Profilo Veicolo", "Consumi e Carburante", "Algoritmo & Filtri", "Notifiche & Dati di Sistema"];

// Le sezioni sono chiuse al caricamento: ogni test apre quelle che usa.
const open = async (user: User, name: string) => {
  const header = screen.getByRole("button", { name });
  if (header.getAttribute("aria-expanded") === "false") await user.click(header);
};
const openAll = async (user: User) => {
  for (const name of SECTIONS) await open(user, name);
};
const saveButton = () => screen.getByRole("button", { name: "Salva Preferenze" });
const restoreButton = () => screen.getByRole("button", { name: "Ripristina Predefiniti" });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = async (user: User, label: string, text: string) => {
  const input = field(label);
  await user.clear(input);
  if (text) await user.type(input, text);
};
const detourSlider = () => screen.getByRole("slider", { name: "Deviazione massima predefinita" }) as HTMLInputElement;
const consumptionSlider = () => screen.getByRole("slider", { name: "Consumo medio misto" }) as HTMLInputElement;
const timeSlider = () => screen.getByRole("slider", { name: "Valore del tuo tempo in euro all'ora" }) as HTMLInputElement;
const setSlider = (slider: HTMLElement, value: number) => fireEvent.change(slider, { target: { value: String(value) } });
const saved = () => loadSettings();

describe("SettingsScreen — struttura", () => {
  it("TUTTE e quattro le sezioni sono chiuse al caricamento (aria-expanded=false, pannello nascosto, chevron non ruotato)", () => {
    renderScreen();
    for (const name of SECTIONS) {
      const header = screen.getByRole("button", { name });
      expect(header, name).toHaveAttribute("aria-expanded", "false");
      const panel = document.getElementById(header.getAttribute("aria-controls")!)!;
      expect(panel, name).toHaveAttribute("hidden");
      expect(panel, name).not.toBeVisible();
      expect(panel.classList.contains("flex"), name).toBe(false);
      expect(header.querySelector("svg.rotate-180"), name).toBeNull(); // chevron verso il basso
    }
  });

  it("si aprono e chiudono col tap: aria-expanded, pannello visibile e chevron ruotato restano coerenti", async () => {
    const user = userEvent.setup();
    renderScreen();
    const header = () => screen.getByRole("button", { name: "Algoritmo & Filtri" });

    await user.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Algoritmo & Filtri" })).toBeVisible();
    expect(header().querySelector("svg.rotate-180")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Profilo Veicolo" })).toHaveAttribute("aria-expanded", "false"); // le altre restano chiuse

    await user.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("acc-algorithm-panel")).not.toBeVisible();
    expect(document.getElementById("acc-algorithm-panel")).toBeInTheDocument(); // resta montato: i campi non perdono il valore
    expect(header().querySelector("svg.rotate-180")).toBeNull();
  });

  it("una sezione chiusa non ha classi display: l'attributo hidden deve poter nasconderla (jsdom non carica il CSS, qui si controlla la causa)", async () => {
    const user = userEvent.setup();
    renderScreen();
    const panel = (id: string) => document.getElementById(`acc-${id}-panel`)!;
    expect(panel("algorithm")).toHaveAttribute("hidden");
    expect(panel("algorithm").classList.contains("flex")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Algoritmo & Filtri" }));
    expect(panel("algorithm")).not.toHaveAttribute("hidden");
    expect(panel("algorithm").classList.contains("flex")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Algoritmo & Filtri" }));
    expect(panel("algorithm").classList.contains("flex")).toBe(false);
  });

  it("titolo, kicker e azioni come da mockup 5", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" })).toBeInTheDocument();
    expect(screen.getByText("Calibrazione algoritmo")).toBeInTheDocument();
    expect(saveButton()).toBeInTheDocument();
    expect(restoreButton()).toBeInTheDocument();
  });

  it("parte dai valori di fabbrica", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();
    expect(within(screen.getByRole("group", { name: "Capacità serbatoio" })).getByText("45 L")).toBeInTheDocument();
    expect(consumptionSlider()).toHaveValue("15");
    expect(screen.getByRole("radio", { name: "Bilanciato" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Automatico/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita autostrada" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita traghetti" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" })).toBeChecked();
    expect(field("Soglia di freschezza prezzi")).toHaveValue("72");
  });
});

describe("SettingsScreen — salvataggio", () => {
  it("«Salva Preferenze» è disattivato finché non cambia qualcosa, poi salva in routefuel.settings.v1", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    expect(saveButton()).toBeDisabled();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();

    await user.click(screen.getByRole("radio", { name: "SUV" }));
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText("Modifiche non salvate.")).toBeInTheDocument();
    expect(saved().vehicle.bodyType).toBe("berlina"); // non ancora salvato

    await user.click(saveButton());
    expect(saved().vehicle.bodyType).toBe("suv");
    expect(screen.getByText("Preferenze salvate")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("routefuel.settings.v1")!).version).toBe(1);
    expect(saveButton()).toBeDisabled(); // di nuovo allineato
  });

  it("profilo veicolo: carrozzeria, modello, serbatoio e carburante predefinito", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    await user.click(screen.getByRole("radio", { name: "Furgone" }));
    await user.type(screen.getByLabelText("Modello"), "Fiat Ducato");
    const stepper = screen.getByRole("group", { name: "Capacità serbatoio" });
    await user.click(within(stepper).getByRole("button", { name: "Aumenta capacità serbatoio" }));
    await user.click(within(stepper).getByRole("button", { name: "Aumenta capacità serbatoio" }));
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    await user.click(saveButton());

    expect(saved().vehicle).toEqual({ bodyType: "furgone", modelName: "Fiat Ducato", tankLiters: 55, defaultFuel: "diesel" });
  });

  it("le preferenze salvate si ritrovano riaprendo la schermata", async () => {
    const user = userEvent.setup();
    const { unmount } = renderScreen();
    await open(user, "Profilo Veicolo");
    await user.click(screen.getByRole("radio", { name: "Wagon" }));
    await user.click(saveButton());
    unmount();

    renderScreen();
    await open(user, "Profilo Veicolo");
    expect(screen.getByRole("radio", { name: "Wagon" })).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it("non salva indirizzi né coordinate", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    await user.type(screen.getByLabelText("Modello"), "Panda");
    await user.click(saveButton());
    expect(localStorage.getItem(SETTINGS_KEY)).not.toMatch(/\"(lat|lon|origin|destination|address|indirizzo)\"/i);
  });
});

describe("SettingsScreen — consumi e carburante (slider come da mockup 5)", () => {
  it("slider 3–40 km/L con passo 0,1, pill del valore corrente e tre tacche «8 Sport», «15 Medio», «30 Eco»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    const slider = consumptionSlider();
    expect(slider).toHaveAttribute("min", "3");
    expect(slider).toHaveAttribute("max", "40");
    expect(slider).toHaveAttribute("step", "0.1");
    expect(slider).toHaveValue("15");
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,0 km/L");
  });

  it("le tre tacche stanno sotto lo slider, distribuite con justify-between: Sport a sinistra, Medio al centro, Eco a destra", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    const sport = screen.getByText("8 Sport");
    const medio = screen.getByText("15 Medio");
    const eco = screen.getByText("30 Eco");
    expect(sport.parentElement).toBe(medio.parentElement);
    expect(medio.parentElement).toBe(eco.parentElement);
    expect(sport.parentElement).toHaveClass("flex", "justify-between");
    expect([...sport.parentElement!.children]).toEqual([sport, medio, eco]);
    // Sotto lo slider, e la riga delle tacche non contiene altro (nessun pulsante «Ripristina» a sporcarla).
    expect(consumptionSlider().compareDocumentPosition(sport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    setSlider(consumptionSlider(), 22);
    expect(within(sport.parentElement!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("muovere lo slider aggiorna la pill e si salva come numero (passo 0,1)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    setSlider(consumptionSlider(), 18.5);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("18,5 km/L");
    setSlider(consumptionSlider(), 3);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("3,0 km/L");
    setSlider(consumptionSlider(), 40);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("40,0 km/L");
    setSlider(consumptionSlider(), 22.5);
    await user.click(saveButton());
    expect(saved().consumptionKmPerLiter).toBe(22.5);
  });

  it("lo slider ha la risoluzione di 0,1 km/L: 15,3 e 7,8 si mostrano e si salvano esatti", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    setSlider(consumptionSlider(), 15.3);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,3 km/L");
    setSlider(consumptionSlider(), 7.8);
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("7,8 km/L");
    await user.click(saveButton());
    expect(saved().consumptionKmPerLiter).toBe(7.8);
  });

  it("«Ripristina» sta nella riga intestazione, accanto alla pill del valore (non sotto lo slider)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    setSlider(consumptionSlider(), 20);
    const restore = screen.getByRole("button", { name: "Ripristina" });
    expect(restore.parentElement).toBe(screen.getByTestId("consumption-pill").parentElement);
    expect(restore.compareDocumentPosition(consumptionSlider()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // sopra lo slider
  });

  it("«Ripristina» appare solo se il valore è cambiato e riporta il consumo a 15", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.queryByRole("button", { name: "Ripristina" })).not.toBeInTheDocument();
    setSlider(consumptionSlider(), 22);
    await user.click(screen.getByRole("button", { name: "Ripristina" }));
    expect(consumptionSlider()).toHaveValue("15");
    expect(screen.getByTestId("consumption-pill")).toHaveTextContent("15,0 km/L");
    expect(screen.queryByRole("button", { name: "Ripristina" })).not.toBeInTheDocument();
  });

  it("costo/km: senza nessun prezzo di riferimento noto mostra «—» (nessun dato inventato)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("—");
    expect(screen.getByTestId("cost-per-km")).not.toHaveAttribute("title"); // niente tooltip senza derivazione
    expect(screen.getByText("nessun prezzo di riferimento noto")).toBeInTheDocument();
  });

  it("costo/km: con l'ultimo riferimento automatico noto è P_avg ÷ consumo, es. «~€0,12/km»", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,12/km"); // 1,80 ÷ 15
    // La derivazione non è una riga visibile: sta nel tooltip del valore.
    expect(screen.getByTestId("cost-per-km")).toHaveAttribute("title", "calcolato da €1,800/L (ultimo riferimento automatico Benzina) ÷ 15,0 km/L");
    expect(screen.queryByText(/ultimo riferimento automatico/)).not.toBeInTheDocument();
    expect(screen.queryByText("nessun prezzo di riferimento noto")).not.toBeInTheDocument(); // compare solo con «—»
  });

  it("costo/km è dinamico: segue il consumo scelto con lo slider", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    setSlider(consumptionSlider(), 30);
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,06/km"); // 1,80 ÷ 30
    setSlider(consumptionSlider(), 8);
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,23/km"); // 1,80 ÷ 8 = 0,225
  });

  it("costo/km: se il riferimento è Manuale usa il prezzo manuale del carburante predefinito, non l'ultimo automatico", async () => {
    seed({ referenceMode: "manual", manualReference: { benzina: 2.25 }, lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Consumi e Carburante");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,15/km"); // 2,25 ÷ 15
    expect(screen.getByTestId("cost-per-km")).toHaveAttribute("title", "calcolato da €2,250/L (riferimento manuale Benzina) ÷ 15,0 km/L");
    expect(screen.queryByText(/riferimento manuale Benzina/)).not.toBeInTheDocument();
  });

  it("costo/km: cambiando il carburante predefinito usa il riferimento di quel carburante, «—» se non lo conosce", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8, diesel: 1.5 } });
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,10/km"); // 1,50 ÷ 15
    await user.click(screen.getByRole("radio", { name: "GPL" }));
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("—");
  });

  it("costo/km: passando a Manuale nella stessa schermata si aggiorna senza salvare (usa la bozza)", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8 } });
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    await type(user, "Benzina", "2,4");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~€0,16/km"); // 2,40 ÷ 15
  });
});

describe("SettingsScreen — valore del tuo tempo (preset nominati)", () => {
  const openAlgorithm = async (user: User) => open(user, "Algoritmo & Filtri");
  const presets = () => screen.getAllByRole("radio", { name: /Solo denaro|Tranquillo|Bilanciato|Ho fretta|Personalizzato/ }).map((r) => r.textContent);

  it("cinque chip nell'ordine: Solo denaro, Tranquillo, Bilanciato, Ho fretta, Personalizzato; di fabbrica «Bilanciato» (attivo bg-primary text-on-primary)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(presets()).toEqual(["Solo denaro", "Tranquillo", "Bilanciato", "Ho fretta", "Personalizzato"]);
    const balanced = screen.getByRole("radio", { name: "Bilanciato" });
    expect(balanced).toBeChecked();
    expect(balanced).toHaveClass("bg-primary", "text-on-primary");
    expect(screen.getByRole("radio", { name: "Ho fretta" })).not.toHaveClass("bg-primary");
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("9 €/h · ≈ €0,15/min");
  });

  it("niente campo numerico come input primario: nessun input di testo «Valore del tuo tempo» e nessuno slider finché non scegli «Personalizzato»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(screen.queryByLabelText("Valore del tuo tempo", { selector: "input[type=text]" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: /Valore del tuo tempo/ })).not.toBeInTheDocument();
  });

  it("la caption spiega cosa vale un'ora del tuo tempo", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(
      screen.getByText("Quanto vale un'ora del tuo tempo? RouteFuel sottrae al risparmio il tempo perso in deviazione, a questo valore."),
    ).toBeInTheDocument();
  });

  it.each([
    ["Solo denaro", 0, "0 €/h"],
    ["Tranquillo", 0.1, "6 €/h · ≈ €0,10/min"],
    ["Bilanciato", 0.15, "9 €/h · ≈ €0,15/min"],
    ["Ho fretta", 0.25, "15 €/h · ≈ €0,25/min"],
  ])("«%s» si salva sempre in €/min (preset ÷ 60): %s", async (label, perMinute, summary) => {
    const user = userEvent.setup();
    seed({ valueOfTimePerMinute: label === "Bilanciato" ? 0.25 : 0.15 }); // parte da un altro preset, così il salvataggio è una modifica
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: label }));
    expect(screen.getByRole("radio", { name: label })).toBeChecked();
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent(summary);
    await user.click(saveButton());
    expect(saved().valueOfTimePerMinute).toBe(perMinute);
  });

  it("«Solo denaro» = 0 €/h: il tempo non entra nel risparmio netto, e lo dice", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Solo denaro" }));
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("il tempo non entra nel risparmio netto");
    expect(saveButton()).toBeEnabled(); // 0 è valido (range 0,00–1,00 €/min)
  });

  it("«Personalizzato» rivela lo slider 3–60 €/h (passo 1), visibile solo se selezionato", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toHaveClass("bg-primary", "text-on-primary");
    expect(screen.getByRole("radio", { name: "Bilanciato" })).not.toBeChecked();
    const slider = timeSlider();
    expect(slider).toHaveAttribute("min", "3");
    expect(slider).toHaveAttribute("max", "60");
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).toHaveValue("9"); // parte dal valore corrente (Bilanciato)

    await user.click(screen.getByRole("radio", { name: "Tranquillo" })); // un preset lo nasconde
    expect(screen.queryByRole("slider", { name: /Valore del tuo tempo/ })).not.toBeInTheDocument();
  });

  it("muovere lo slider cambia il valore e si salva in €/min (€/h ÷ 60), senza uscire da «Personalizzato»", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    setSlider(timeSlider(), 12);
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("12 €/h · ≈ €0,20/min");
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked();

    setSlider(timeSlider(), 60);
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("60 €/h · ≈ €1,00/min");
    setSlider(timeSlider(), 3);
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("3 €/h · ≈ €0,05/min");
    setSlider(timeSlider(), 30);
    await user.click(saveButton());
    expect(saved().valueOfTimePerMinute).toBe(0.5);
  });

  it("anche un valore dello slider uguale a un preset (9 €/h) resta «Personalizzato» finché non scegli il chip", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    setSlider(timeSlider(), 9);
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Bilanciato" })).not.toBeChecked();
  });

  it("da «Solo denaro» (0) lo slider parte dal suo minimo, 3 €/h, perché 0 è fuori dal suo intervallo", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Solo denaro" }));
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    expect(timeSlider()).toHaveValue("3");
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("3 €/h · ≈ €0,05/min");
  });

  it("un valore salvato che non è un preset (0,30 €/min = 18 €/h) si riapre su «Personalizzato» con lo slider a 18", async () => {
    seed({ valueOfTimePerMinute: 0.3 });
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked();
    expect(timeSlider()).toHaveValue("18");
    expect(screen.getByTestId("vtime-summary")).toHaveTextContent("18 €/h · ≈ €0,30/min");
  });

  it("un valore salvato uguale a un preset si riapre su quel chip (es. 0,25 → «Ho fretta»)", async () => {
    seed({ valueOfTimePerMinute: 0.25 });
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    expect(screen.getByRole("radio", { name: "Ho fretta" })).toBeChecked();
    expect(screen.queryByRole("slider", { name: /Valore del tuo tempo/ })).not.toBeInTheDocument();
  });

  it("slider e preset non producono mai un valore fuori da 0,00–1,00 €/min", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openAlgorithm(user);
    await user.click(screen.getByRole("radio", { name: "Personalizzato" }));
    for (const hour of [3, 17, 33, 60]) {
      setSlider(timeSlider(), hour);
      await user.click(saveButton());
      const value = saved().valueOfTimePerMinute;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeCloseTo(hour / 60, 4);
    }
  });
});

describe("SettingsScreen — algoritmo e filtri", () => {
  it("tre toggle di percorso e il default «Solo Self»: si salvano", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    for (const name of ["Evita autostrada", "Evita pedaggi", "Evita traghetti"]) {
      const toggle = screen.getByRole("switch", { name });
      expect(toggle, name).toHaveAttribute("aria-checked", "false");
      await user.click(toggle);
      expect(toggle, name).toHaveAttribute("aria-checked", "true");
    }
    await user.click(screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" }));
    await user.click(saveButton());

    const s = saved();
    expect(s.avoidMotorway).toBe(true);
    expect(s.avoidTolls).toBe(true);
    expect(s.avoidFerries).toBe(true);
    expect(s.onlySelf).toBe(false);
  });

  it("dichiara che il pedaggio non rientra nel calcolo", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    expect(screen.getAllByText(/non rientra nel calcolo/).length).toBeGreaterThan(0);
  });

  it("«Deviazione massima predefinita»: slider 1–10 km (passo 1), di fabbrica 5, si salva e precompila la ricerca", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    const slider = detourSlider();
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "10");
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).toHaveValue("5");
    expect(screen.getByTestId("default-detour-pill")).toHaveTextContent("5 km");

    setSlider(detourSlider(), 8);
    expect(screen.getByTestId("default-detour-pill")).toHaveTextContent("8 km");
    await user.click(saveButton());
    expect(saved().defaultMaxDetourKm).toBe(8);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).settings.defaultMaxDetourKm).toBe(8);
  });

  it("«Deviazione massima predefinita»: agli estremi 1 e 10 km", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    for (const km of [1, 10]) {
      setSlider(detourSlider(), km);
      expect(screen.getByTestId("default-detour-pill")).toHaveTextContent(`${km} km`);
      await user.click(saveButton());
      expect(saved().defaultMaxDetourKm).toBe(km);
    }
  });

  it("«Solo Self» predefinito è ON di fabbrica e spegnerlo si salva", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    const toggle = screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    await user.click(saveButton());
    expect(saved().onlySelf).toBe(false);
  });

  it("Prezzo di riferimento: Automatico di default, nessun campo manuale", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    expect(screen.getByRole("radio", { name: /Automatico/ })).toBeChecked();
    expect(screen.queryByLabelText("Benzina", { selector: "input" })).not.toBeInTheDocument();
  });

  it("passando a Manuale i campi per carburante si pre-compilano con l'ultimo prezzo automatico noto", async () => {
    seed({ lastAutomaticReference: { benzina: 1.8543, diesel: 1.91 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));

    expect(field("Benzina")).toHaveValue("1,854");
    expect(field("Diesel")).toHaveValue("1,91");
    expect(field("GPL")).toHaveValue(""); // mai cercato: vuoto (usa il calcolo automatico)
    expect(field("Metano")).toHaveValue("");
    expect(screen.getByText(/Sostituisce completamente il calcolo automatico/)).toBeInTheDocument();
  });

  it("il valore manuale si salva per carburante e sostituisce il riferimento finché non si torna ad Automatico", async () => {
    seed({ lastAutomaticReference: { benzina: 1.85 } });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    await type(user, "Benzina", "1,99");
    await type(user, "GPL", "0,78");
    await user.click(saveButton());

    let s = saved();
    expect(s.referenceMode).toBe("manual");
    expect(s.manualReference).toEqual({ benzina: 1.99, gpl: 0.78 });
    expect(referenceOverrideFor(s, "benzina")).toBe(1.99);
    expect(referenceOverrideFor(s, "gpl")).toBe(0.78);
    expect(referenceOverrideFor(s, "diesel")).toBeUndefined(); // vuoto: automatico per quel carburante

    // Tornando ad Automatico i valori manuali restano memorizzati ma non contano più.
    await user.click(screen.getByRole("radio", { name: /Automatico/ }));
    await user.click(saveButton());
    s = saved();
    expect(s.referenceMode).toBe("auto");
    expect(s.manualReference).toEqual({ benzina: 1.99, gpl: 0.78 });
    expect(referenceOverrideFor(s, "benzina")).toBeUndefined();

    // E riattivando Manuale ritrovano i propri valori (non vengono sovrascritti dalla pre-compilazione).
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    expect(field("Benzina")).toHaveValue("1,99");
  });

  it("prezzo manuale fuori intervallo (0,5–4 €/L): errore e blocco; tornare ad Automatico sblocca", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    await type(user, "Benzina", "0,3");
    expect(screen.getByRole("alert")).toHaveTextContent("tra 0,5 e 4 €/L");
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Automatico/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Manuale/ }));
    await type(user, "Benzina", "1,8");
    expect(saveButton()).toBeEnabled();
  });
});

describe("SettingsScreen — notifiche e dati di sistema", () => {
  it("soglia di freschezza: default 72 ore, intero tra 1 e 720", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    for (const bad of ["0", "721", "3,5", "x", ""]) {
      await type(user, "Soglia di freschezza prezzi", bad);
      expect(screen.getByRole("alert")).toHaveTextContent("numero intero tra 1 e 720");
      expect(saveButton()).toBeDisabled();
    }
    await type(user, "Soglia di freschezza prezzi", "24");
    await user.click(saveButton());
    expect(saved().maxPriceAgeHours).toBe(24);
  });

  it("dichiara la fonte dei prezzi e che le notifiche non ci sono (nessuna funzione inventata)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    expect(screen.getByText(/MIMIT Osservaprezzi/)).toBeInTheDocument();
    expect(screen.getByText(/Le notifiche non sono disponibili in questa versione/)).toBeInTheDocument();
  });
});

describe("SettingsScreen — Ripristina Predefiniti", () => {
  it("riporta tutti i campi ai valori di fabbrica, incluso Automatico, «Bilanciato» e «Solo Self» ON, e lo salva", async () => {
    saveSettings({
      vehicle: { bodyType: "suv", modelName: "Golf", tankLiters: 60, defaultFuel: "gpl" },
      consumptionKmPerLiter: 20,
      valueOfTimePerMinute: 0.5,
      referenceMode: "manual",
      manualReference: { benzina: 1.9, gpl: 0.8 },
      lastAutomaticReference: { benzina: 1.85 },
      avoidMotorway: true,
      avoidTolls: true,
      avoidFerries: true,
      onlySelf: false,
      defaultMaxDetourKm: 8,
      maxPriceAgeHours: 24,
    });
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(screen.getByRole("radio", { name: /Manuale/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Personalizzato" })).toBeChecked(); // 0,50 €/min = 30 €/h
    expect(timeSlider()).toHaveValue("30");

    await user.click(restoreButton());

    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(screen.getByLabelText("Modello")).toHaveValue("");
    expect(within(screen.getByRole("group", { name: "Capacità serbatoio" })).getByText("45 L")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();
    expect(consumptionSlider()).toHaveValue("15");
    expect(detourSlider()).toHaveValue("5");
    expect(screen.getByRole("radio", { name: "Bilanciato" })).toBeChecked();
    expect(screen.queryByRole("slider", { name: /Valore del tuo tempo/ })).not.toBeInTheDocument(); // «Personalizzato» chiuso
    expect(screen.getByRole("radio", { name: /Automatico/ })).toBeChecked();
    expect(screen.queryByLabelText("Diesel", { selector: "input" })).not.toBeInTheDocument(); // campi manuali nascosti
    expect(screen.getByRole("switch", { name: "Evita autostrada" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Evita traghetti" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" })).toHaveAttribute("aria-checked", "true");
    expect(field("Soglia di freschezza prezzi")).toHaveValue("72");
    expect(screen.getByText("Valori di fabbrica ripristinati")).toBeInTheDocument();

    const s = saved();
    expect(s.referenceMode).toBe("auto");
    expect(s.manualReference).toEqual({});
    expect(s.valueOfTimePerMinute).toBe(0.15);
    expect({ ...s, lastAutomaticReference: {} }).toEqual(FACTORY_SETTINGS);
    expect(s.lastAutomaticReference).toEqual({ benzina: 1.85 }); // la cache non è una preferenza
    expect(referenceOverrideFor(s, "benzina")).toBeUndefined();
  });

  it("scarta anche le modifiche non salvate", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Profilo Veicolo");
    await user.click(screen.getByRole("radio", { name: "Moto" }));
    await user.click(restoreButton());
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it("ripristina anche i campi con testo non valido e sblocca il salvataggio", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Notifiche & Dati di Sistema");
    await type(user, "Soglia di freschezza prezzi", "zzz");
    expect(saveButton()).toBeDisabled();
    await user.click(restoreButton());
    expect(field("Soglia di freschezza prezzi")).toHaveValue("72");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SettingsScreen — ogni campo persistito abilita «Salva Preferenze»", () => {
  type Case = (user: User) => Promise<unknown>;
  const toggle = (name: string): Case => async (user) => user.click(screen.getByRole("switch", { name }));
  const CASES: Record<Exclude<keyof Settings, "lastAutomaticReference">, { seed?: Partial<Settings>; act: Case }> = {
    vehicle: { act: async (user) => user.click(screen.getByRole("radio", { name: "SUV" })) },
    consumptionKmPerLiter: { act: async () => setSlider(consumptionSlider(), 20) },
    valueOfTimePerMinute: { act: async (user) => user.click(screen.getByRole("radio", { name: "Tranquillo" })) },
    referenceMode: { act: async (user) => user.click(screen.getByRole("radio", { name: /Manuale/ })) },
    manualReference: { seed: { referenceMode: "manual" }, act: async (user) => type(user, "Benzina", "1,95") },
    avoidMotorway: { act: toggle("Evita autostrada") },
    avoidTolls: { act: toggle("Evita pedaggi") },
    avoidFerries: { act: toggle("Evita traghetti") },
    onlySelf: { act: toggle("Cerca solo stazioni Self per impostazione predefinita") },
    defaultMaxDetourKm: { act: async () => setSlider(detourSlider(), 8) },
    maxPriceAgeHours: { act: async (user) => type(user, "Soglia di freschezza prezzi", "24") },
  };

  it("la tabella copre TUTTI i campi di FACTORY_SETTINGS (un campo nuovo senza caso fa fallire questo test)", () => {
    const persisted = Object.keys(FACTORY_SETTINGS).filter((key) => key !== "lastAutomaticReference");
    expect(Object.keys(CASES).sort()).toEqual(persisted.sort());
  });

  it.each(Object.keys(CASES) as Array<keyof typeof CASES>)("%s: modificarlo abilita il salvataggio e lo scrive", async (key) => {
    const { seed: seedPatch, act } = CASES[key];
    if (seedPatch) seed(seedPatch);
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(saveButton()).toBeDisabled();
    await act(user);
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());
    const before = { ...FACTORY_SETTINGS, ...seedPatch }[key];
    expect(JSON.stringify(saved()[key])).not.toBe(JSON.stringify(before)); // il valore scritto è cambiato
  });
});

describe("SettingsScreen — robustezza", () => {
  it("con localStorage danneggiato parte dai valori di fabbrica", async () => {
    localStorage.setItem(SETTINGS_KEY, "{rotto");
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(consumptionSlider()).toHaveValue("15");
    expect(screen.getByRole("radio", { name: "Bilanciato" })).toBeChecked();
  });

  it("un salvataggio precedente senza i campi nuovi (pedaggi, traghetti, Solo Self) si legge senza errori, con i default", async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, settings: { vehicle: { bodyType: "suv", modelName: "", tankLiters: 60, defaultFuel: "diesel" }, avoidMotorway: true } }),
    );
    const user = userEvent.setup();
    renderScreen();
    await openAll(user);
    expect(screen.getByRole("radio", { name: "SUV" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita autostrada" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Evita pedaggi" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Cerca solo stazioni Self per impostazione predefinita" })).toHaveAttribute("aria-checked", "true");
  });
});

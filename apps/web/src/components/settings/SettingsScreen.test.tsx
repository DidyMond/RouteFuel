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

const open = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  const header = screen.getByRole("button", { name });
  if (header.getAttribute("aria-expanded") === "false") await user.click(header);
};
const saveButton = () => screen.getByRole("button", { name: "Salva Preferenze" });
const restoreButton = () => screen.getByRole("button", { name: "Ripristina Predefiniti" });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => {
  const input = field(label);
  await user.clear(input);
  if (text) await user.type(input, text);
};
const saved = () => loadSettings();

describe("SettingsScreen — struttura", () => {
  it("quattro sezioni a fisarmonica: Profilo e Consumi aperte, Algoritmo e Sistema chiuse; si aprono e chiudono col tap", async () => {
    const user = userEvent.setup();
    renderScreen();
    const names = ["Profilo Veicolo", "Consumi e Carburante", "Algoritmo & Filtri", "Notifiche & Dati di Sistema"];
    expect(names.map((n) => screen.getByRole("button", { name: n }).getAttribute("aria-expanded"))).toEqual(["true", "true", "false", "false"]);

    await user.click(screen.getByRole("button", { name: "Algoritmo & Filtri" }));
    expect(screen.getByRole("button", { name: "Algoritmo & Filtri" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Algoritmo & Filtri" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Profilo Veicolo" }));
    expect(screen.getByRole("button", { name: "Profilo Veicolo" })).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("acc-vehicle-panel")).not.toBeVisible();
    expect(document.getElementById("acc-vehicle-panel")).toBeInTheDocument(); // resta montato: i campi non perdono il valore
  });

  it("una sezione chiusa non ha classi display: l'attributo hidden deve poter nasconderla (jsdom non carica il CSS, qui si controlla la causa)", async () => {
    const user = userEvent.setup();
    renderScreen();
    const panel = (id: string) => document.getElementById(`acc-${id}-panel`)!;
    expect(panel("algorithm")).toHaveAttribute("hidden");
    expect(panel("algorithm").classList.contains("flex")).toBe(false);
    expect(panel("vehicle")).not.toHaveAttribute("hidden");
    expect(panel("vehicle").classList.contains("flex")).toBe(true);

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
    await open(user, "Algoritmo & Filtri");
    await open(user, "Notifiche & Dati di Sistema");
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();
    expect(within(screen.getByRole("group", { name: "Capacità serbatoio" })).getByText("45 L")).toBeInTheDocument();
    expect(field("Consumo medio misto")).toHaveValue("15");
    expect(field("Valore del tuo tempo")).toHaveValue("0,15");
    expect(screen.getByRole("radio", { name: /Automatico/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Evita autostrada" })).not.toBeChecked();
    expect(field("Soglia di freschezza prezzi")).toHaveValue("72");
  });
});

describe("SettingsScreen — salvataggio", () => {
  it("«Salva Preferenze» è disattivato finché non cambia qualcosa, poi salva in routefuel.settings.v1", async () => {
    const user = userEvent.setup();
    renderScreen();
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
    await user.click(screen.getByRole("radio", { name: "Wagon" }));
    await user.click(saveButton());
    unmount();

    renderScreen();
    expect(screen.getByRole("radio", { name: "Wagon" })).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it("non salva indirizzi né coordinate", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByLabelText("Modello"), "Panda");
    await user.click(saveButton());
    expect(localStorage.getItem(SETTINGS_KEY)).not.toMatch(/\"(lat|lon|origin|destination|address|indirizzo)\"/i);
  });
});

describe("SettingsScreen — consumo con ripristino", () => {
  it("consumo valido (virgola o punto) si salva come numero", async () => {
    const user = userEvent.setup();
    renderScreen();
    await type(user, "Consumo medio misto", "18,5");
    await user.click(saveButton());
    expect(saved().consumptionKmPerLiter).toBe(18.5);
  });

  it("fuori intervallo (3–40 km/L): errore, campo segnalato e salvataggio bloccato", async () => {
    const user = userEvent.setup();
    renderScreen();
    for (const bad of ["2,9", "41", "abc"]) {
      await type(user, "Consumo medio misto", bad);
      expect(screen.getByRole("alert")).toHaveTextContent("Inserisci un valore tra 3 e 40 km/L.");
      expect(field("Consumo medio misto")).toHaveAttribute("aria-invalid", "true");
      expect(saveButton()).toBeDisabled();
    }
    await type(user, "Consumo medio misto", "3");
    expect(saveButton()).toBeEnabled();
  });

  it("«Ripristina» riporta il consumo a 15 km/L, anche partendo da un testo non valido", async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.queryByRole("button", { name: /Ripristina \(/ })).not.toBeInTheDocument();
    await type(user, "Consumo medio misto", "22");
    await user.click(screen.getByRole("button", { name: /Ripristina \(15 km\/L\)/ }));
    expect(field("Consumo medio misto")).toHaveValue("15");

    await type(user, "Consumo medio misto", "xx");
    expect(saveButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Ripristina \(15 km\/L\)/ }));
    expect(field("Consumo medio misto")).toHaveValue("15");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra il costo al km solo se c'è un ultimo prezzo di riferimento reale (nessun dato inventato)", () => {
    renderScreen();
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("si calcola dal prezzo di riferimento della tratta");
  });

  it("con l'ultimo riferimento automatico noto calcola P_avg ÷ consumo", () => {
    seed({ lastAutomaticReference: { benzina: 1.79 } });
    renderScreen();
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~0,119 €/km");
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("Benzina €1,790/L");
  });
});

describe("SettingsScreen — algoritmo e filtri", () => {
  it("V_time: default 0,15, range validato 0,05–1,00", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");

    for (const bad of ["0,04", "0,049", "1,01", "2", "0", "x"]) {
      await type(user, "Valore del tuo tempo", bad);
      expect(screen.getByRole("alert")).toHaveTextContent("tra 0,05 e 1 €/min");
      expect(saveButton()).toBeDisabled();
    }
    for (const good of ["0,05", "1", "1,00", "0,3"]) {
      await type(user, "Valore del tuo tempo", good);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    }
    await user.click(saveButton());
    expect(saved().valueOfTimePerMinute).toBe(0.3);
  });

  it("Evita autostrada: interruttore che si salva", async () => {
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    const toggle = screen.getByRole("switch", { name: "Evita autostrada" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(saveButton());
    expect(saved().avoidMotorway).toBe(true);
    expect(screen.getByText(/Il pedaggio non rientra nel calcolo/)).toBeInTheDocument();
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
  it("riporta tutti i campi ai valori di fabbrica, incluso Automatico sul prezzo di riferimento, e lo salva", async () => {
    saveSettings({
      vehicle: { bodyType: "suv", modelName: "Golf", tankLiters: 60, defaultFuel: "gpl" },
      consumptionKmPerLiter: 20,
      valueOfTimePerMinute: 0.5,
      referenceMode: "manual",
      manualReference: { benzina: 1.9, gpl: 0.8 },
      lastAutomaticReference: { benzina: 1.85 },
      avoidMotorway: true,
      maxPriceAgeHours: 24,
    });
    const user = userEvent.setup();
    renderScreen();
    await open(user, "Algoritmo & Filtri");
    await open(user, "Notifiche & Dati di Sistema");
    expect(screen.getByRole("radio", { name: /Manuale/ })).toBeChecked();

    await user.click(restoreButton());

    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(screen.getByLabelText("Modello")).toHaveValue("");
    expect(within(screen.getByRole("group", { name: "Capacità serbatoio" })).getByText("45 L")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();
    expect(field("Consumo medio misto")).toHaveValue("15");
    expect(field("Valore del tuo tempo")).toHaveValue("0,15");
    expect(screen.getByRole("radio", { name: /Automatico/ })).toBeChecked();
    expect(screen.queryByLabelText("Diesel", { selector: "input" })).not.toBeInTheDocument(); // campi manuali nascosti
    expect(screen.getByRole("switch", { name: "Evita autostrada" })).toHaveAttribute("aria-checked", "false");
    expect(field("Soglia di freschezza prezzi")).toHaveValue("72");
    expect(screen.getByText("Valori di fabbrica ripristinati")).toBeInTheDocument();

    const s = saved();
    expect(s.referenceMode).toBe("auto");
    expect(s.manualReference).toEqual({});
    expect({ ...s, lastAutomaticReference: {} }).toEqual(FACTORY_SETTINGS);
    expect(s.lastAutomaticReference).toEqual({ benzina: 1.85 }); // la cache non è una preferenza
    expect(referenceOverrideFor(s, "benzina")).toBeUndefined();
  });

  it("ripristina anche i campi con testo non valido e sblocca il salvataggio", async () => {
    const user = userEvent.setup();
    renderScreen();
    await type(user, "Consumo medio misto", "zzz");
    expect(saveButton()).toBeDisabled();
    await user.click(restoreButton());
    expect(field("Consumo medio misto")).toHaveValue("15");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("scarta anche le modifiche non salvate", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole("radio", { name: "Moto" }));
    await user.click(restoreButton());
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });
});

describe("SettingsScreen — robustezza", () => {
  it("con localStorage danneggiato parte dai valori di fabbrica", () => {
    localStorage.setItem(SETTINGS_KEY, "{rotto");
    renderScreen();
    expect(screen.getByRole("radio", { name: "Berlina" })).toBeChecked();
    expect(field("Consumo medio misto")).toHaveValue("15");
  });

  it("un cambio di testo e subito il valore: nessun valore fuori intervallo entra mai nella bozza", async () => {
    renderScreen();
    fireEvent.change(field("Consumo medio misto"), { target: { value: "99" } });
    expect(saveButton()).toBeDisabled();
    fireEvent.change(field("Consumo medio misto"), { target: { value: "16" } });
    expect(saveButton()).toBeEnabled();
  });
});

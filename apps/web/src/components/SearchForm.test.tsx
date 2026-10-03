import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider, useSettings } from "../hooks/useSettings";
import { FACTORY_SETTINGS, resetSettingsMemory, saveSettings, type Settings } from "../lib/settings";
import { SearchForm } from "./SearchForm";

const suggestions = [
  { id: "a", name: "Via Alessandro Volta 3", label: "Via Alessandro Volta 3, 20816 Ceriano Laghetto", lon: 9.079, lat: 45.628 },
  { id: "b", name: "Via del Seprio 42", label: "Via del Seprio 42, 22074 Lomazzo", lon: 9.023, lat: 45.699 },
];

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ suggestions }) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function Harness({ onSubmit, next }: { onSubmit: (request: unknown, labels: unknown) => void; next?: Settings }) {
  const { save } = useSettings();
  return (
    <>
      {next && (
        <button type="button" onClick={() => save(next)}>
          applica impostazioni
        </button>
      )}
      <SearchForm onSubmit={onSubmit} busy={false} />
    </>
  );
}

function renderForm(props: { next?: Settings; settings?: Settings } = {}) {
  if (props.settings) saveSettings(props.settings);
  const onSubmit = vi.fn();
  render(
    <SettingsProvider>
      <Harness onSubmit={onSubmit} next={props.next} />
    </SettingsProvider>,
  );
  return onSubmit;
}

async function chooseRoute(user: ReturnType<typeof userEvent.setup>) {
  for (const [placeholder, index] of [
    ["Da dove parti?", 0],
    ["Dove vuoi andare?", 1],
  ] as const) {
    await user.type(screen.getByPlaceholderText(placeholder), index === 0 ? "via volta" : "via seprio");
    const option = (await screen.findAllByRole("option"))[index]!;
    await user.click(option);
  }
}

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
  await chooseRoute(user);
  await user.click(screen.getByRole("button", { name: "Trova il carburante più conveniente" }));
};

const settings = (patch: Partial<Settings>): Settings => ({ ...FACTORY_SETTINGS, ...patch });

describe("SearchForm — precompilazione dalle Impostazioni", () => {
  it("senza impostazioni salvate parte dai valori di fabbrica", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();
    expect(screen.getByText("45 L")).toBeInTheDocument();
    expect(screen.getByLabelText("Consumo del veicolo")).toHaveValue("15");
  });

  it("usa carburante predefinito, serbatoio e consumo salvati", () => {
    renderForm({
      settings: settings({ vehicle: { ...FACTORY_SETTINGS.vehicle, defaultFuel: "diesel", tankLiters: 60 }, consumptionKmPerLiter: 18.5 }),
    });
    expect(screen.getByRole("radio", { name: "Diesel" })).toBeChecked();
    expect(screen.getByText("60 L")).toBeInTheDocument();
    expect(screen.getByLabelText("Consumo del veicolo")).toHaveValue("18.5");
  });

  it("quando le Impostazioni cambiano la ricerca successiva riparte dai nuovi default", async () => {
    const user = userEvent.setup();
    renderForm({ next: settings({ vehicle: { ...FACTORY_SETTINGS.vehicle, defaultFuel: "gpl", tankLiters: 35 }, consumptionKmPerLiter: 12 }) });
    expect(screen.getByRole("radio", { name: "Benzina" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "applica impostazioni" }));
    expect(screen.getByRole("radio", { name: "GPL" })).toBeChecked();
    expect(screen.getByText("35 L")).toBeInTheDocument();
    expect(screen.getByLabelText("Consumo del veicolo")).toHaveValue("12");
  });

  it("«Ripristina» del consumo torna al valore salvato nelle Impostazioni", async () => {
    const user = userEvent.setup();
    renderForm({ settings: settings({ consumptionKmPerLiter: 18 }) });
    const input = screen.getByLabelText("Consumo del veicolo");
    await user.clear(input);
    await user.type(input, "22");
    await user.click(screen.getByRole("button", { name: "Ripristina" }));
    expect(input).toHaveValue("18");
  });
});

describe("SearchForm — deviazione massima dalle Impostazioni", () => {
  const slider = () => screen.getByLabelText("Deviazione massima") as HTMLInputElement;

  it("senza impostazioni salvate lo slider parte da 5 km; con «Deviazione massima predefinita» salvata parte da quel valore", () => {
    const first = render(
      <SettingsProvider>
        <SearchForm onSubmit={vi.fn()} busy={false} />
      </SettingsProvider>,
    );
    expect(slider()).toHaveValue("5");
    first.unmount();
    saveSettings({ ...FACTORY_SETTINGS, defaultMaxDetourKm: 8 });
    render(
      <SettingsProvider>
        <SearchForm onSubmit={vi.fn()} busy={false} />
      </SettingsProvider>,
    );
    expect(slider()).toHaveValue("8");
    expect(screen.getByText("8 km")).toBeInTheDocument();
  });

  it("si può cambiare per ricerca e la richiesta porta il valore dello slider", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ defaultMaxDetourKm: 7 }) });
    fireEvent.change(slider(), { target: { value: "3" } });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ maxDetourKm: 3 });
  });

  it("la richiesta di default porta il valore predefinito delle Impostazioni", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ defaultMaxDetourKm: 9 }) });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ maxDetourKm: 9 });
  });

  it("quando le Impostazioni cambiano lo slider riparte dal nuovo default", async () => {
    const user = userEvent.setup();
    renderForm({ next: settings({ defaultMaxDetourKm: 2 }) });
    fireEvent.change(slider(), { target: { value: "6" } });
    expect(slider()).toHaveValue("6");
    await user.click(screen.getByRole("button", { name: "applica impostazioni" }));
    expect(slider()).toHaveValue("2");
  });
});

describe("SearchForm — switch «Solo Self» ed «Evita autostrada» per ricerca", () => {
  const onlySelf = () => screen.getByRole("switch", { name: "Solo Self" });
  const avoid = () => screen.getByRole("switch", { name: "Evita autostrada" });

  it("sono accanto: «Solo Self» seguito da «Evita autostrada», e di fabbrica Solo Self è ON ed Evita autostrada OFF", () => {
    renderForm();
    expect(onlySelf()).toHaveAttribute("aria-checked", "true");
    expect(avoid()).toHaveAttribute("aria-checked", "false");
    expect(onlySelf().compareDocumentPosition(avoid()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sono precompilati dai default delle Impostazioni (Solo Self OFF, Evita autostrada ON)", () => {
    renderForm({ settings: settings({ onlySelf: false, avoidMotorway: true }) });
    expect(onlySelf()).toHaveAttribute("aria-checked", "false");
    expect(avoid()).toHaveAttribute("aria-checked", "true");
  });

  it("si cambiano per ricerca e vengono inviati con la richiesta, senza toccare le Impostazioni salvate", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await user.click(onlySelf());
    await user.click(avoid());
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ onlySelf: false, avoidMotorway: true });
    expect(localStorage.getItem("routefuel.settings.v1")).toBeNull(); // la scelta per-ricerca non è una preferenza
  });

  it("la richiesta porta i default di pedaggi e traghetti dalle Impostazioni (non hanno switch nel form)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ avoidTolls: true, avoidFerries: true }) });
    expect(screen.queryByRole("switch", { name: /pedaggi|traghetti/i })).not.toBeInTheDocument();
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ avoidMotorway: false, avoidTolls: true, avoidFerries: true });
  });

  it("quando le Impostazioni cambiano, entrambi gli switch ripartono dai nuovi default", async () => {
    const user = userEvent.setup();
    renderForm({ next: settings({ onlySelf: false, avoidMotorway: true }) });
    await user.click(onlySelf()); // la scelta per-ricerca (ora OFF)
    await user.click(onlySelf()); // di nuovo ON
    await user.click(screen.getByRole("button", { name: "applica impostazioni" }));
    expect(onlySelf()).toHaveAttribute("aria-checked", "false");
    expect(avoid()).toHaveAttribute("aria-checked", "true");
  });
});

describe("SearchForm — richiesta con i parametri delle Impostazioni", () => {
  it("di fabbrica: V_time 0,15, soglia 72 h, nessuna esclusione, Solo Self, nessun prezzo di riferimento manuale", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await submit(user);
    const request = onSubmit.mock.calls[0]![0];
    expect(request).toMatchObject({ fuelType: "benzina", liters: 45, consumptionKmPerLiter: 15, valueOfTimePerMinute: 0.15, maxPriceAgeHours: 72, onlySelf: true, avoidMotorway: false, avoidTolls: false, avoidFerries: false });
    expect(request).not.toHaveProperty("referencePriceOverride");
  });

  it("invia V_time, soglia di freschezza e «Evita autostrada» salvati", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ valueOfTimePerMinute: 0.4, maxPriceAgeHours: 24, avoidMotorway: true }) });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ valueOfTimePerMinute: 0.4, maxPriceAgeHours: 24, avoidMotorway: true });
  });

  it("prezzo di riferimento manuale: invia il valore del carburante cercato", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ referenceMode: "manual", manualReference: { benzina: 1.95, diesel: 1.8 } }) });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ fuelType: "benzina", referencePriceOverride: 1.95 });
  });

  it("cambiando carburante nel form si usa il valore manuale di QUEL carburante", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ referenceMode: "manual", manualReference: { benzina: 1.95, diesel: 1.8 } }) });
    await user.click(screen.getByRole("radio", { name: "Diesel" }));
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ fuelType: "diesel", referencePriceOverride: 1.8 });
  });

  it("manuale ma senza valore per il carburante cercato: nessun override (calcolo automatico)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ referenceMode: "manual", manualReference: { benzina: 1.95 } }) });
    await user.click(screen.getByRole("radio", { name: "GPL" }));
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty("referencePriceOverride");
  });

  it("modalità Automatico: i valori manuali memorizzati non vengono inviati", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ referenceMode: "auto", manualReference: { benzina: 1.95 } }) });
    await submit(user);
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty("referencePriceOverride");
  });

  it("la richiesta non contiene altro che coordinate scelte nel form: nulla delle impostazioni è un indirizzo", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ settings: settings({ vehicle: { ...FACTORY_SETTINGS.vehicle, modelName: "Panda" } }) });
    await submit(user);
    expect(JSON.stringify(onSubmit.mock.calls[0]![0])).not.toContain("Panda"); // il modello non entra nella ricerca
    const labels = onSubmit.mock.calls[0]![1] as { origin: string; destination: string };
    expect(labels.origin).toContain("Ceriano Laghetto");
  });
});

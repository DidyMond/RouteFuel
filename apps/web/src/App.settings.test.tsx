import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, resetSettingsMemory, SETTINGS_KEY } from "./lib/settings";

// Ricerca simulata: lo stato di useSearch è deciso dal singolo test.
const searchState = vi.hoisted(() => ({ current: { status: "idle" } as unknown }));
vi.mock("./hooks/useSearch", () => ({ useSearch: () => ({ state: searchState.current, search: vi.fn() }) }));
vi.mock("./components/results/MapView", () => ({ MapView: () => <div data-testid="map-stub" /> }));

import App from "./App";
import { makeResponse, REQUEST } from "./test/fixtures";

function successWith(referencePrice: { value: number; level: "on_route" | "corridor" | "national" | "manual"; sampleSize: number }, fuelType: "benzina" | "diesel" = "benzina") {
  const response = makeResponse({ referencePrice });
  searchState.current = {
    status: "success",
    response,
    results: response.results,
    refinement: response.refinement,
    request: { ...REQUEST, fuelType },
    labels: { origin: "Milano", destination: "Bologna" },
  };
}

const renderApp = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
  searchState.current = { status: "idle" };
});

describe("App — barra inferiore a 3 tab e rotta /settings", () => {
  it("la barra ha Cerca, Risultati e Impostazioni (in quest'ordine)", () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(within(nav).getAllByText(/Cerca|Risultati|Impostazioni/).map((el) => el.textContent)).toEqual(["Cerca", "Risultati", "Impostazioni"]);
  });

  it("«Impostazioni» è sempre raggiungibile, anche senza ricerca, e apre la schermata", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Impostazioni" })).toHaveAttribute("aria-current", "page");
  });

  it("un indirizzo diretto /settings apre le Impostazioni", () => {
    renderApp("/settings");
    expect(screen.getByRole("heading", { level: 1, name: "Impostazioni Veicolo & Risparmio" })).toBeInTheDocument();
  });

  it("la barra resta anche sulle Impostazioni (come su Cerca e Risultati)", () => {
    renderApp("/settings");
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();
  });

  it("le preferenze salvate precompilano il form di Cerca alla ricerca successiva", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    // La Home resta montata (nascosta) sotto le Impostazioni: si agisce dentro la sezione del profilo veicolo.
    const profile = screen.getByRole("region", { name: "Profilo Veicolo" });
    await user.click(within(profile).getByRole("radio", { name: "Diesel" }));
    const stepper = screen.getByRole("group", { name: "Capacità serbatoio" });
    await user.click(within(stepper).getByRole("button", { name: "Aumenta capacità serbatoio" }));
    await user.click(screen.getByRole("button", { name: "Salva Preferenze" }));
    expect(loadSettings().vehicle).toMatchObject({ defaultFuel: "diesel", tankLiters: 50 });

    await user.click(screen.getByRole("link", { name: "Cerca" }));
    expect(screen.getByRole("radio", { name: "Diesel", checked: true })).toBeInTheDocument();
    expect(screen.getByText("50 L")).toBeInTheDocument();
  });
});

describe("App — ultimo prezzo di riferimento automatico (per pre-compilare «Manuale»)", () => {
  it("dopo una ricerca automatica ricorda il riferimento di quel carburante", () => {
    successWith({ value: 2.139, level: "on_route", sampleSize: 40 });
    renderApp("/results");
    expect(loadSettings().lastAutomaticReference).toEqual({ benzina: 2.139 });
  });

  it("un riferimento manuale NON viene ricordato come automatico", () => {
    successWith({ value: 2.5, level: "manual", sampleSize: 0 });
    renderApp("/results");
    expect(loadSettings().lastAutomaticReference).toEqual({});
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull(); // niente da scrivere
  });

  it("ricorda per carburante, senza toccare le preferenze", () => {
    successWith({ value: 1.95, level: "corridor", sampleSize: 12 }, "diesel");
    renderApp("/results");
    const s = loadSettings();
    expect(s.lastAutomaticReference).toEqual({ diesel: 1.95 });
    expect(s.referenceMode).toBe("auto");
    expect(s.vehicle.defaultFuel).toBe("benzina");
  });

  it("le Impostazioni mostrano il costo al km dall'ultimo riferimento automatico", async () => {
    successWith({ value: 1.8, level: "on_route", sampleSize: 40 });
    const user = userEvent.setup();
    renderApp("/results");
    await user.click(screen.getByRole("link", { name: "Impostazioni" }));
    expect(screen.getByTestId("cost-per-km")).toHaveTextContent("~0,120 €/km"); // 1,80 ÷ 15 km/L
  });
});

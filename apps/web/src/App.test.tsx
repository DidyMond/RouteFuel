import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/results/MapView", () => ({ MapView: () => <div data-testid="map-stub" /> }));

import App from "./App";

describe("App — routing", () => {
  it("la Home mostra il form di ricerca e la scheda Risultati è disattivata finché non c'è una ricerca", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /Pianifica viaggio/ })).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(nav).toHaveTextContent("Cerca");
    expect(screen.queryByRole("link", { name: "Risultati" })).not.toBeInTheDocument();
    expect(screen.getByText("Risultati").closest("[aria-disabled=true]")).not.toBeNull();
  });

  it("«Ripristina» (testo piccolo) usa il verde scuro per il contrasto WCAG", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    await user.clear(screen.getByLabelText("Consumo del veicolo"));
    await user.type(screen.getByLabelText("Consumo del veicolo"), "16");
    expect(screen.getByRole("button", { name: "Ripristina" })).toHaveClass("text-on-primary-fixed-variant");
  });

  it("aprire /results senza una ricerca riporta alla Home", () => {
    render(
      <MemoryRouter initialEntries={["/results"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /Pianifica viaggio/ })).toBeVisible();
    expect(screen.queryByTestId("bottom-sheet")).not.toBeInTheDocument();
  });

  it("un percorso sconosciuto riporta alla Home", () => {
    render(
      <MemoryRouter initialEntries={["/qualcosa"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /Pianifica viaggio/ })).toBeVisible();
  });
});
